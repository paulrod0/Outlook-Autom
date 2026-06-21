"""
Generación por línea de comandos, pensada para automatización (Task Scheduler,
cron, scripts). Comparte el mismo núcleo que la web.

Ejemplos:
    # Lote desde Excel a ZIP de PNG
    python -m barcode_qr_tool.cli batch refs.xlsx --column SKU --out etiquetas.zip

    # Hoja PDF imprimible de códigos de barras
    python -m barcode_qr_tool.cli batch refs.csv --column 0 --mode barcode \\
        --symbology code128 --pdf --out hoja.pdf

    # Una etiqueta individual
    python -m barcode_qr_tool.cli single "REF-00123" --out ref.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .generator import (
    LabelConfig,
    LabelError,
    compose_label,
    compose_label_svg,
    generate_batch,
    generate_batch_svg,
    images_to_pdf_sheet,
    images_to_zip,
    normalize_value,
    read_two_columns_csv,
    read_two_columns_xlsx,
    svgs_to_zip,
)
from .templates_catalog import LABEL_TEMPLATES, get_template


def _add_config_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--mode", choices=["qr", "barcode"], default="qr")
    p.add_argument("--symbology", default="code128")
    p.add_argument("--width", type=float, default=5.0, help="ancho etiqueta (cm)")
    p.add_argument("--height", type=float, default=3.0, help="alto etiqueta (cm)")
    p.add_argument("--bar-height", type=float, default=1.5, help="alto código (cm)")
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--no-text", action="store_true", help="oculta el texto legible")
    p.add_argument("--qr-error", default="M", choices=["L", "M", "Q", "H"])
    p.add_argument("--subtitle", action="store_true", help="muestra segunda línea de texto")
    p.add_argument("--logo", help="ruta a un logo para incrustar en el centro del QR")


def _config(args) -> LabelConfig:
    logo_bytes = Path(args.logo).read_bytes() if getattr(args, "logo", None) else None
    config = LabelConfig(
        mode=args.mode,
        symbology=args.symbology,
        label_width_cm=args.width,
        label_height_cm=args.height,
        bar_height_cm=args.bar_height,
        dpi=args.dpi,
        show_text=not args.no_text,
        qr_error=args.qr_error,
        show_subtitle=getattr(args, "subtitle", False),
        logo_bytes=logo_bytes,
    )
    tpl_key = getattr(args, "template", None)
    if tpl_key:
        tpl = get_template(tpl_key)
        config.label_width_cm = tpl.label_w_cm
        config.label_height_cm = tpl.label_h_cm
    return config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generador de códigos de barras y QR")
    sub = parser.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("single", help="una etiqueta")
    s.add_argument("value")
    s.add_argument("--out", default="etiqueta.png", help="salida (.png o .svg)")
    s.add_argument("--subtitle-text", default=None, help="texto de la segunda línea")
    _add_config_args(s)

    b = sub.add_parser("batch", help="lote desde Excel/CSV")
    b.add_argument("file")
    b.add_argument("--column", required=True, help="columna de referencias (nombre o índice)")
    b.add_argument("--subtitle-column", default=None, help="columna para la 2ª línea")
    b.add_argument("--out", default="etiquetas.zip")
    b.add_argument("--pdf", action="store_true", help="exporta hoja PDF en vez de ZIP")
    b.add_argument("--svg", action="store_true", help="exporta ZIP de SVG vectoriales")
    b.add_argument("--template", choices=sorted(LABEL_TEMPLATES), help="plantilla Avery/Dymo")
    b.add_argument("--keep-duplicates", action="store_true")
    _add_config_args(b)

    args = parser.parse_args(argv)
    config = _config(args)

    try:
        if args.cmd == "single":
            config.validate()
            value = normalize_value(args.value, config)
            if args.out.lower().endswith(".svg"):
                Path(args.out).write_text(
                    compose_label_svg(value, config, subtitle=args.subtitle_text),
                    encoding="utf-8",
                )
            else:
                compose_label(value, config, subtitle=args.subtitle_text).save(args.out)
            print(f"Guardado: {args.out}")
            return 0

        if args.cmd == "batch":
            data = Path(args.file).read_bytes()
            col = int(args.column) if args.column.isdigit() else args.column
            scol = (
                (int(args.subtitle_column) if args.subtitle_column.isdigit() else args.subtitle_column)
                if args.subtitle_column else None
            )
            if args.file.lower().endswith(".xlsx"):
                values, subtitles = read_two_columns_xlsx(data, col, scol)
            elif args.file.lower().endswith(".csv"):
                values, subtitles = read_two_columns_csv(data, col, scol)
            else:
                print("Formato no soportado (usa .xlsx o .csv)", file=sys.stderr)
                return 2

            dedupe = not args.keep_duplicates
            if args.svg:
                svgs, errors = generate_batch_svg(values, config, dedupe=dedupe, subtitles=subtitles)
                if not svgs:
                    print("No se generó ninguna etiqueta.", file=sys.stderr)
                    return 1
                Path(args.out).write_bytes(svgs_to_zip(svgs))
                count = len(svgs)
            else:
                result = generate_batch(values, config, dedupe=dedupe, subtitles=subtitles)
                errors = result.errors
                if not result.images:
                    print("No se generó ninguna etiqueta.", file=sys.stderr)
                    return 1
                if args.pdf:
                    tpl = get_template(args.template) if args.template else None
                    Path(args.out).write_bytes(images_to_pdf_sheet(result.images, config, template=tpl))
                else:
                    Path(args.out).write_bytes(images_to_zip(result.images))
                count = len(result.images)

            print(f"Generadas {count} etiquetas -> {args.out}")
            if errors:
                print(f"{len(errors)} fila(s) con error:", file=sys.stderr)
                for val, reason in errors[:10]:
                    print(f"  - {val!r}: {reason}", file=sys.stderr)
            return 0
    except LabelError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
