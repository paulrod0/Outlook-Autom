"""
Núcleo de generación de etiquetas de códigos de barras y QR.

Este módulo no depende de Flask: se puede usar desde la web, desde la línea de
comandos o desde tests. Toda la lógica de imagen vive aquí.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from typing import Iterable

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
    show_text: bool = True  # texto legible bajo el código
    qr_error: str = "M"
    margin_cm: float = 0.2
    font_size_pt: float = 10.0

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
    qr = qrcode.QRCode(
        error_correction=QR_ERROR_LEVELS[config.qr_error],
        box_size=10,
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


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


def compose_label(value: str, config: LabelConfig) -> Image.Image:
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

    # Espacio reservado para el texto legible.
    font = None
    text_h = 0
    if config.show_text:
        font_px = max(8, round(config.font_size_pt / 72 * config.dpi))
        font = _load_font(font_px)
        text_h = font_px + margin // 2

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

    if config.show_text and font is not None:
        draw = ImageDraw.Draw(canvas)
        bbox = draw.textbbox((0, 0), value, font=font)
        tw = bbox[2] - bbox[0]
        text_value = value
        # Recorta con elipsis si el texto no cabe.
        while tw > avail_w and len(text_value) > 4:
            text_value = text_value[:-2] + "…"
            bbox = draw.textbbox((0, 0), text_value, font=font)
            tw = bbox[2] - bbox[0]
        tx = (canvas_w - tw) // 2
        ty = canvas_h - margin - (bbox[3] - bbox[1])
        draw.text((tx, ty), text_value, fill="black", font=font)

    return canvas


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


def generate_batch(
    values: Iterable[str], config: LabelConfig, dedupe: bool = True
) -> GenerationResult:
    """Genera etiquetas para una lista de valores, acumulando errores por fila."""
    config.validate()
    result = GenerationResult()
    used_names: set[str] = set()
    seen: set[str] = set()

    for raw in values:
        raw = (raw or "").strip()
        if not raw:
            continue
        if dedupe and raw in seen:
            continue
        seen.add(raw)
        try:
            normalized = normalize_value(raw, config)
            img = compose_label(normalized, config)
            result.images[_safe_filename(raw, used_names)] = img
        except LabelError as exc:
            result.errors.append((raw, str(exc)))
        except Exception as exc:  # pragma: no cover - defensivo
            result.errors.append((raw, f"Error inesperado: {exc}"))
    return result


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
) -> bytes:
    """
    Compone una hoja imprimible con todas las etiquetas en rejilla.

    Mejora frente a una simple descarga: permite imprimir directamente sobre
    papel de etiquetas sin recolocar nada.
    """
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.units import cm as CM
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.lib.utils import ImageReader

    page_size = {"A4": A4, "letter": letter}.get(page, A4)
    pw, ph = page_size
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=page_size)

    lw = config.label_width_cm * CM
    lh = config.label_height_cm * CM
    gap = gap_cm * CM
    margin = 1.0 * CM

    cols = max(1, int((pw - 2 * margin + gap) // (lw + gap)))
    rows = max(1, int((ph - 2 * margin + gap) // (lh + gap)))
    per_page = cols * rows

    items = list(images.values())
    for idx, img in enumerate(items):
        slot = idx % per_page
        if idx and slot == 0:
            c.showPage()
        col = slot % cols
        row = slot // cols
        x = margin + col * (lw + gap)
        y = ph - margin - (row + 1) * lh - row * gap
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
