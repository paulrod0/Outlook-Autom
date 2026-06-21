"""
Núcleo de generación de etiquetas de códigos de barras y QR.

Este módulo no depende de Flask: se puede usar desde la web, desde la línea de
comandos o desde tests. Toda la lógica de imagen vive aquí.
"""

from __future__ import annotations

import base64
import html
import io
import re
import zipfile
from dataclasses import dataclass, field
from typing import Iterable, Sequence

import barcode
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import (
    ERROR_CORRECT_L,
    ERROR_CORRECT_M,
    ERROR_CORRECT_Q,
    ERROR_CORRECT_H,
)

# --- Constantes ------------------------------------------------------------

#: Simbologías de código de barras soportadas y su nombre legible.
BARCODE_SYMBOLOGIES = {
    "code128": "Code 128 (alfanumérico, uso general)",
    "code39": "Code 39 (alfanumérico)",
    "ean13": "EAN-13 (13 dígitos)",
    "ean8": "EAN-8 (8 dígitos)",
    "upca": "UPC-A (12 dígitos)",
    "isbn13": "ISBN-13",
}

QR_ERROR_LEVELS = {
    "L": ERROR_CORRECT_L,  # ~7 %
    "M": ERROR_CORRECT_M,  # ~15 %
    "Q": ERROR_CORRECT_Q,  # ~25 %
    "H": ERROR_CORRECT_H,  # ~30 % (recomendado si lleva logo)
}

# Simbologías numéricas con longitud y dígito de control fijos.
_FIXED_LENGTH = {"ean13": 13, "ean8": 8, "upca": 12, "isbn13": 13}


def cm_to_px(cm: float, dpi: int) -> int:
    """Convierte centímetros a píxeles para una resolución de impresión dada."""
    return max(1, round(cm / 2.54 * dpi))


class LabelError(ValueError):
    """Error de validación con un mensaje apto para mostrar al usuario."""


# --- Configuración de una tirada ------------------------------------------


@dataclass
class LabelConfig:
    mode: str = "qr"  # "qr" o "barcode"
    symbology: str = "code128"  # sólo si mode == "barcode"
    label_width_cm: float = 5.0
    label_height_cm: float = 3.0
    bar_height_cm: float = 1.5  # alto del propio código dentro de la etiqueta
    dpi: int = 300
    show_text: bool = True  # texto legible (referencia) bajo el código
    qr_error: str = "M"
    margin_cm: float = 0.2
    font_size_pt: float = 10.0
    # Segunda línea de texto (descripción, precio, ubicación…). Su valor es
    # por etiqueta; aquí sólo se indica si debe reservarse espacio y su tamaño.
    show_subtitle: bool = False
    subtitle_font_size_pt: float = 8.0
    # Logo central para QR (bytes de una imagen). Fuerza corrección H.
    logo_bytes: bytes | None = None

    def validate(self) -> None:
        if self.mode not in ("qr", "barcode"):
            raise LabelError(f"Modo desconocido: {self.mode!r}")
        if self.mode == "barcode" and self.symbology not in BARCODE_SYMBOLOGIES:
            raise LabelError(f"Simbología no soportada: {self.symbology!r}")
        if self.qr_error not in QR_ERROR_LEVELS:
            raise LabelError(f"Nivel de corrección QR no válido: {self.qr_error!r}")
        for name, value in (
            ("ancho de etiqueta", self.label_width_cm),
            ("alto de etiqueta", self.label_height_cm),
            ("alto del código", self.bar_height_cm),
        ):
            if value <= 0:
                raise LabelError(f"El {name} debe ser mayor que 0 cm.")
        if not (50 <= self.dpi <= 1200):
            raise LabelError("El DPI debe estar entre 50 y 1200.")
        if self.bar_height_cm > self.label_height_cm:
            raise LabelError(
                "El alto del código no puede superar el alto de la etiqueta."
            )


# --- Validación de datos ---------------------------------------------------


def _checksum_ean(digits: str) -> str:
    """Calcula el dígito de control para EAN/UPC sobre los datos sin él."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        total += int(ch) * (3 if i % 2 == 0 else 1)
    return str((10 - total % 10) % 10)


def normalize_value(value: str, config: LabelConfig) -> str:
    """
    Normaliza y valida un valor de referencia para la simbología elegida.

    Devuelve el valor listo para codificar o lanza ``LabelError`` con un
    mensaje claro. Para los códigos numéricos completa el dígito de control
    cuando el usuario aporta los datos sin él (longitud - 1).
    """
    value = (value or "").strip()
    if not value:
        raise LabelError("Valor vacío.")

    if config.mode == "qr":
        return value  # un QR admite cualquier texto/URL

    sym = config.symbology
    if sym in _FIXED_LENGTH:
        if not value.isdigit():
            raise LabelError(f"{sym.upper()} sólo admite dígitos: {value!r}")
        expected = _FIXED_LENGTH[sym]
        if len(value) == expected - 1:
            value += _checksum_ean(value)  # autocompleta el control
        elif len(value) == expected:
            pass  # el control se reverifica más abajo al renderizar
        else:
            raise LabelError(
                f"{sym.upper()} requiere {expected} dígitos "
                f"(o {expected - 1} y se calcula el control). Recibido: {len(value)}."
            )
    elif sym == "code39":
        if not re.fullmatch(r"[0-9A-Z\-. $/+%]*", value.upper()):
            raise LabelError(f"Code 39 contiene caracteres no válidos: {value!r}")
        value = value.upper()
    return value


# --- Render de un código ---------------------------------------------------


def _render_qr(value: str, config: LabelConfig) -> Image.Image:
    # Si lleva logo, forzamos el nivel de corrección más alto (H) para que el
    # código siga siendo legible aunque el logo tape parte del centro.
    level = "H" if config.logo_bytes else config.qr_error
    qr = qrcode.QRCode(
        error_correction=QR_ERROR_LEVELS[level],
        box_size=10,
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    if config.logo_bytes:
        img = _paste_logo(img, config.logo_bytes)
    return img


def _paste_logo(qr_img: Image.Image, logo_bytes: bytes) -> Image.Image:
    """Coloca el logo centrado sobre el QR, ocupando ~22 % de su lado."""
    try:
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    except Exception as exc:
        raise LabelError(f"No se pudo leer el logo: {exc}") from exc

    side = int(min(qr_img.size) * 0.22)
    logo.thumbnail((side, side), Image.LANCZOS)

    # Recuadro blanco de respaldo para mejorar el contraste del logo.
    pad = max(2, side // 10)
    box = Image.new("RGBA", (logo.width + 2 * pad, logo.height + 2 * pad), "white")
    box.paste(logo, (pad, pad), logo)

    base = qr_img.convert("RGBA")
    pos = ((base.width - box.width) // 2, (base.height - box.height) // 2)
    base.alpha_composite(box, pos)
    return base.convert("RGB")


def _render_barcode(value: str, config: LabelConfig) -> Image.Image:
    try:
        cls = barcode.get_barcode_class(config.symbology)
    except Exception as exc:  # pragma: no cover - defensivo
        raise LabelError(f"Simbología no soportada: {config.symbology}") from exc

    writer = ImageWriter()
    # El alto en píxeles lo controlamos al componer la etiqueta; aquí pedimos
    # módulos generosos para no perder resolución al reescalar.
    options = {
        "module_width": 0.3,
        "module_height": max(5.0, config.bar_height_cm * 10),  # mm
        "quiet_zone": 2.0,
        "font_size": 0,  # el texto legible lo dibujamos nosotros
        "write_text": False,
        "dpi": config.dpi,
    }
    try:
        code = cls(value, writer=writer)
    except Exception as exc:
        raise LabelError(f"Valor no válido para {config.symbology}: {exc}") from exc
    return code.render(options).convert("RGB")


def _load_font(px: int) -> ImageFont.FreeTypeFont:
    for name in ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            continue
    return ImageFont.load_default()


def _fit_text(draw, text, font, max_w):
    """Recorta el texto con elipsis hasta que quepa en ``max_w`` píxeles."""
    out = text
    while out and (draw.textbbox((0, 0), out, font=font)[2]) > max_w and len(out) > 4:
        out = out[:-2] + "…"
    return out


def compose_label(value: str, config: LabelConfig, subtitle: str | None = None) -> Image.Image:
    """Genera la etiqueta completa (código + texto) ya dimensionada en cm."""
    canvas_w = cm_to_px(config.label_width_cm, config.dpi)
    canvas_h = cm_to_px(config.label_height_cm, config.dpi)
    margin = cm_to_px(config.margin_cm, config.dpi)
    canvas = Image.new("RGB", (canvas_w, canvas_h), "white")

    code_img = (
        _render_qr(value, config)
        if config.mode == "qr"
        else _render_barcode(value, config)
    )

    # Espacio reservado para una o dos líneas de texto legible.
    font = subtitle_font = None
    text_h = 0
    has_subtitle = config.show_subtitle and bool(subtitle)
    if config.show_text:
        font_px = max(8, round(config.font_size_pt / 72 * config.dpi))
        font = _load_font(font_px)
        text_h += font_px + margin // 2
    if has_subtitle:
        sub_px = max(7, round(config.subtitle_font_size_pt / 72 * config.dpi))
        subtitle_font = _load_font(sub_px)
        text_h += sub_px + margin // 4

    avail_w = canvas_w - 2 * margin
    avail_h = canvas_h - 2 * margin - text_h
    if avail_w <= 0 or avail_h <= 0:
        raise LabelError(
            "La etiqueta es demasiado pequeña para el contenido y los márgenes."
        )

    # Escalar el código manteniendo proporción.
    scale = min(avail_w / code_img.width, avail_h / code_img.height)
    new_size = (max(1, round(code_img.width * scale)), max(1, round(code_img.height * scale)))
    code_img = code_img.resize(new_size, Image.LANCZOS)

    code_x = (canvas_w - code_img.width) // 2
    code_y = margin + (avail_h - code_img.height) // 2
    canvas.paste(code_img, (code_x, code_y))

    draw = ImageDraw.Draw(canvas)
    y = canvas_h - margin
    # El subtítulo va más abajo; lo dibujamos primero (de abajo a arriba).
    if has_subtitle and subtitle_font is not None:
        text = _fit_text(draw, subtitle.strip(), subtitle_font, avail_w)
        bbox = draw.textbbox((0, 0), text, font=subtitle_font)
        y -= bbox[3] - bbox[1]
        draw.text(((canvas_w - (bbox[2] - bbox[0])) // 2, y), text, fill="black", font=subtitle_font)
        y -= margin // 4
    if config.show_text and font is not None:
        text = _fit_text(draw, value, font, avail_w)
        bbox = draw.textbbox((0, 0), text, font=font)
        y -= bbox[3] - bbox[1]
        draw.text(((canvas_w - (bbox[2] - bbox[0])) // 2, y), text, fill="black", font=font)

    return canvas


# --- Render vectorial (SVG) -------------------------------------------------


def _qr_matrix(value: str, config: LabelConfig) -> list[list[bool]]:
    level = "H" if config.logo_bytes else config.qr_error
    qr = qrcode.QRCode(error_correction=QR_ERROR_LEVELS[level], border=2)
    qr.add_data(value)
    qr.make(fit=True)
    return qr.get_matrix()


def _barcode_modules(value: str, config: LabelConfig) -> str:
    """Devuelve la cadena binaria de módulos (un carácter '0'/'1' por módulo)."""
    try:
        cls = barcode.get_barcode_class(config.symbology)
        code = cls(value)
    except Exception as exc:
        raise LabelError(f"Valor no válido para {config.symbology}: {exc}") from exc
    return code.build()[0]


def _logo_data_uri(logo_bytes: bytes) -> str:
    try:
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    except Exception as exc:
        raise LabelError(f"No se pudo leer el logo: {exc}") from exc
    buf = io.BytesIO()
    logo.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _svg_text(x: float, y: float, text: str, size_mm: float) -> str:
    return (
        f'<text x="{x:.2f}" y="{y:.2f}" font-family="sans-serif" '
        f'font-size="{size_mm:.2f}" text-anchor="middle" fill="#000">'
        f"{html.escape(text)}</text>"
    )


def _truncate(text: str, max_chars: int) -> str:
    text = text.strip()
    return text if len(text) <= max_chars else text[: max_chars - 1] + "…"


def compose_label_svg(value: str, config: LabelConfig, subtitle: str | None = None) -> str:
    """
    Genera la etiqueta como SVG vectorial (cadena de texto).

    El código (QR o barras) se dibuja con primitivas vectoriales, por lo que la
    etiqueta se puede escalar e imprimir a cualquier tamaño sin pérdida.
    Unidad interna: milímetros; el lienzo lleva tamaño real en centímetros.
    """
    W = config.label_width_cm * 10.0  # mm
    H = config.label_height_cm * 10.0
    m = config.margin_cm * 10.0
    pt2mm = 25.4 / 72.0

    line1_h = config.font_size_pt * pt2mm * 1.3 if config.show_text else 0.0
    has_subtitle = config.show_subtitle and bool(subtitle)
    line2_h = config.subtitle_font_size_pt * pt2mm * 1.3 if has_subtitle else 0.0
    text_h = line1_h + line2_h

    code_w = W - 2 * m
    code_h = H - 2 * m - text_h
    if code_w <= 0 or code_h <= 0:
        raise LabelError("La etiqueta es demasiado pequeña para el contenido y los márgenes.")

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{config.label_width_cm:.3f}cm" height="{config.label_height_cm:.3f}cm" '
        f'viewBox="0 0 {W:.2f} {H:.2f}">',
        f'<rect width="{W:.2f}" height="{H:.2f}" fill="#fff"/>',
    ]

    if config.mode == "qr":
        matrix = _qr_matrix(value, config)
        n = len(matrix)
        side = min(code_w, code_h)
        module = side / n
        ox = (W - side) / 2
        oy = m + (code_h - side) / 2
        for r, row in enumerate(matrix):
            # Agrupa celdas contiguas en un solo rect por eficiencia.
            c = 0
            while c < n:
                if row[c]:
                    start = c
                    while c < n and row[c]:
                        c += 1
                    parts.append(
                        f'<rect x="{ox + start * module:.3f}" y="{oy + r * module:.3f}" '
                        f'width="{(c - start) * module:.3f}" height="{module:.3f}" fill="#000"/>'
                    )
                else:
                    c += 1
        if config.logo_bytes:
            lside = side * 0.22
            pad = lside * 0.12
            bx, by = (W - lside) / 2 - pad, oy + (side - lside) / 2 - pad
            parts.append(
                f'<rect x="{bx:.2f}" y="{by:.2f}" width="{lside + 2 * pad:.2f}" '
                f'height="{lside + 2 * pad:.2f}" fill="#fff"/>'
            )
            parts.append(
                f'<image x="{(W - lside) / 2:.2f}" y="{oy + (side - lside) / 2:.2f}" '
                f'width="{lside:.2f}" height="{lside:.2f}" '
                f'xlink:href="{_logo_data_uri(config.logo_bytes)}"/>'
            )
    else:
        modules = _barcode_modules(value, config)
        nmods = len(modules)
        module_w = code_w / nmods
        bar_h = min(code_h, config.bar_height_cm * 10.0)
        oy = m + (code_h - bar_h) / 2
        i = 0
        while i < nmods:
            if modules[i] == "1":
                start = i
                while i < nmods and modules[i] == "1":
                    i += 1
                parts.append(
                    f'<rect x="{m + start * module_w:.3f}" y="{oy:.3f}" '
                    f'width="{(i - start) * module_w:.3f}" height="{bar_h:.3f}" fill="#000"/>'
                )
            else:
                i += 1

    # Texto (de abajo hacia arriba).
    cx = W / 2
    y = H - m
    if has_subtitle:
        size = config.subtitle_font_size_pt * pt2mm
        parts.append(_svg_text(cx, y, _truncate(subtitle, int(code_w / (size * 0.55))), size))
        y -= line2_h
    if config.show_text:
        size = config.font_size_pt * pt2mm
        parts.append(_svg_text(cx, y, _truncate(value, int(code_w / (size * 0.55))), size))

    parts.append("</svg>")
    return "".join(parts)


def svgs_to_zip(svgs: dict[str, str]) -> bytes:
    """Empaqueta etiquetas SVG en un ZIP en memoria."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, svg in svgs.items():
            zf.writestr(f"{name}.svg", svg)
    return buf.getvalue()


# --- Exportación -----------------------------------------------------------


@dataclass
class GenerationResult:
    images: dict[str, Image.Image] = field(default_factory=dict)
    errors: list[tuple[str, str]] = field(default_factory=list)  # (valor, motivo)


def _safe_filename(value: str, used: set[str]) -> str:
    base = re.sub(r"[^\w\-]+", "_", value).strip("_") or "etiqueta"
    name = base
    i = 1
    while name in used:
        i += 1
        name = f"{base}_{i}"
    used.add(name)
    return name


def _iter_valid(values, config, dedupe, subtitles):
    """Valida y normaliza filas; produce (nombre, valor, subtítulo, original)."""
    used_names: set[str] = set()
    seen: set[str] = set()
    for idx, raw in enumerate(values):
        raw = (raw or "").strip()
        if not raw:
            continue
        if dedupe and raw in seen:
            continue
        seen.add(raw)
        subtitle = subtitles[idx] if subtitles and idx < len(subtitles) else None
        yield _safe_filename(raw, used_names), raw, subtitle


def generate_batch(
    values: Iterable[str],
    config: LabelConfig,
    dedupe: bool = True,
    subtitles: Sequence[str] | None = None,
) -> GenerationResult:
    """
    Genera etiquetas (PNG) para una lista de valores, acumulando errores por fila.

    ``subtitles`` (opcional) es una lista paralela a ``values`` con la segunda
    línea de texto de cada etiqueta (descripción, precio, ubicación…).
    """
    config.validate()
    result = GenerationResult()
    for name, raw, subtitle in _iter_valid(values, config, dedupe, list(subtitles or [])):
        try:
            normalized = normalize_value(raw, config)
            result.images[name] = compose_label(normalized, config, subtitle=subtitle)
        except LabelError as exc:
            result.errors.append((raw, str(exc)))
        except Exception as exc:  # pragma: no cover - defensivo
            result.errors.append((raw, f"Error inesperado: {exc}"))
    return result


def generate_batch_svg(
    values: Iterable[str],
    config: LabelConfig,
    dedupe: bool = True,
    subtitles: Sequence[str] | None = None,
) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Como ``generate_batch`` pero produce SVG vectorial (nombre -> texto SVG)."""
    config.validate()
    svgs: dict[str, str] = {}
    errors: list[tuple[str, str]] = []
    for name, raw, subtitle in _iter_valid(values, config, dedupe, list(subtitles or [])):
        try:
            normalized = normalize_value(raw, config)
            svgs[name] = compose_label_svg(normalized, config, subtitle=subtitle)
        except LabelError as exc:
            errors.append((raw, str(exc)))
        except Exception as exc:  # pragma: no cover - defensivo
            errors.append((raw, f"Error inesperado: {exc}"))
    return svgs, errors


def images_to_zip(images: dict[str, Image.Image], fmt: str = "PNG") -> bytes:
    """Empaqueta las imágenes en un ZIP en memoria."""
    ext = fmt.lower()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, img in images.items():
            img_buf = io.BytesIO()
            img.save(img_buf, format=fmt)
            zf.writestr(f"{name}.{ext}", img_buf.getvalue())
    return buf.getvalue()


def images_to_pdf_sheet(
    images: dict[str, Image.Image],
    config: LabelConfig,
    page: str = "A4",
    gap_cm: float = 0.3,
    template=None,
) -> bytes:
    """
    Compone una hoja imprimible con todas las etiquetas en rejilla.

    Si se pasa ``template`` (un ``LabelTemplate`` del catálogo), se usa su
    geometría exacta —tamaño de etiqueta, columnas, filas, márgenes y
    separaciones— para que encaje sobre papel/rollo comercial (Avery, Dymo…).
    En caso contrario se calcula una rejilla automática para el tamaño de
    etiqueta configurado.
    """
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.units import cm as CM
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.lib.utils import ImageReader

    if template is not None:
        if template.page == "label":
            page_size = (template.label_w_cm * CM, template.label_h_cm * CM)
        else:
            page_size = {"A4": A4, "letter": letter}.get(template.page, A4)
        pw, ph = page_size
        lw = template.label_w_cm * CM
        lh = template.label_h_cm * CM
        gap_x = template.gap_x_cm * CM
        gap_y = template.gap_y_cm * CM
        margin_left = template.margin_left_cm * CM
        margin_top = template.margin_top_cm * CM
        cols, rows = template.cols, template.rows
    else:
        page_size = {"A4": A4, "letter": letter}.get(page, A4)
        pw, ph = page_size
        lw = config.label_width_cm * CM
        lh = config.label_height_cm * CM
        gap_x = gap_y = gap_cm * CM
        margin_left = margin_top = 1.0 * CM
        cols = max(1, int((pw - 2 * margin_left + gap_x) // (lw + gap_x)))
        rows = max(1, int((ph - 2 * margin_top + gap_y) // (lh + gap_y)))

    per_page = max(1, cols * rows)
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=page_size)

    for idx, img in enumerate(images.values()):
        slot = idx % per_page
        if idx and slot == 0:
            c.showPage()
        col = slot % cols
        row = slot // cols
        x = margin_left + col * (lw + gap_x)
        y = ph - margin_top - (row + 1) * lh - row * gap_y
        c.drawImage(ImageReader(img), x, y, width=lw, height=lh)
    c.showPage()
    c.save()
    return buf.getvalue()


# --- Lectura de fuentes de datos ------------------------------------------


def read_column_from_xlsx(file_bytes: bytes, column: str | int, sheet: str | None = None) -> list[str]:
    """Lee una columna de un .xlsx. ``column`` puede ser nombre de cabecera o índice."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if header is None:
        return []

    if isinstance(column, int):
        col_idx = column
    else:
        try:
            col_idx = [str(h).strip() if h is not None else "" for h in header].index(column)
        except ValueError:
            raise LabelError(f"No existe la columna {column!r} en la hoja.")

    out = []
    for row in rows:
        if col_idx < len(row) and row[col_idx] is not None:
            out.append(str(row[col_idx]).strip())
    return out


def xlsx_headers(file_bytes: bytes, sheet: str | None = None) -> list[str]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    header = next(ws.iter_rows(values_only=True), None)
    if not header:
        return []
    return [str(h).strip() if h is not None else f"Columna {i+1}" for i, h in enumerate(header)]


def _resolve_col(header: list, column: str | int, src: str) -> int:
    if isinstance(column, int):
        return column
    names = [str(h).strip() if h is not None else "" for h in header]
    try:
        return names.index(column)
    except ValueError:
        raise LabelError(f"No existe la columna {column!r} en el {src}.")


def read_two_columns_xlsx(
    file_bytes: bytes, value_col: str | int, subtitle_col: str | int | None, sheet: str | None = None
) -> tuple[list[str], list[str]]:
    """Lee la columna de referencias y, opcionalmente, la de subtítulos, alineadas."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb[sheet] if sheet else wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if header is None:
        return [], []
    vi = _resolve_col(list(header), value_col, "Excel")
    si = _resolve_col(list(header), subtitle_col, "Excel") if subtitle_col not in (None, "") else None

    values, subtitles = [], []
    for row in rows:
        if vi < len(row) and row[vi] is not None and str(row[vi]).strip():
            values.append(str(row[vi]).strip())
            sub = row[si] if si is not None and si < len(row) and row[si] is not None else ""
            subtitles.append(str(sub).strip())
    return values, subtitles


def read_two_columns_csv(
    file_bytes: bytes, value_col: str | int, subtitle_col: str | int | None
) -> tuple[list[str], list[str]]:
    import csv

    text = file_bytes.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    if not rows:
        return [], []
    header = rows[0]
    vi = _resolve_col(header, value_col, "CSV")
    si = _resolve_col(header, subtitle_col, "CSV") if subtitle_col not in (None, "") else None

    values, subtitles = [], []
    for r in rows[1:]:
        if vi < len(r) and r[vi].strip():
            values.append(r[vi].strip())
            subtitles.append(r[si].strip() if si is not None and si < len(r) else "")
    return values, subtitles


def read_column_from_csv(file_bytes: bytes, column: str | int) -> list[str]:
    """Lee una columna de un CSV (autodetecta separador)."""
    import csv

    text = file_bytes.decode("utf-8-sig", errors="replace")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = list(reader)
    if not rows:
        return []
    header = rows[0]
    if isinstance(column, int):
        col_idx = column
    else:
        try:
            col_idx = [h.strip() for h in header].index(column)
        except ValueError:
            raise LabelError(f"No existe la columna {column!r} en el CSV.")
    return [r[col_idx].strip() for r in rows[1:] if col_idx < len(r) and r[col_idx].strip()]
