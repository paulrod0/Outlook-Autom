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
    generate_batch,
    images_to_pdf_sheet,
    images_to_zip,
    normalize_value,
    read_column_from_csv,
    read_column_from_xlsx,
)


def _add_config_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--mode", choices=["qr", "barcode"], default="qr")
    p.add_argument("--symbology", default="code128")
    p.add_argument("--width", type=float, default=5.0, help="ancho etiqueta (cm)")
    p.add_argument("--height", type=float, default=3.0, help="alto etiqueta (cm)")
    p.add_argument("--bar-height", type=float, default=1.5, help="alto código (cm)")
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--no-text", action="store_true", help="oculta el texto legible")
    p.add_argument("--qr-error", default="M", choices=["L", "M", "Q", "H"])


def _config(args) -> LabelConfig:
    return LabelConfig(
        mode=args.mode,
        symbology=args.symbology,
        label_width_cm=args.width,
        label_height_cm=args.height,
        bar_height_cm=args.bar_height,
        dpi=args.dpi,
        show_text=not args.no_text,
        qr_error=args.qr_error,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generador de códigos de barras y QR")
    sub = parser.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("single", help="una etiqueta")
    s.add_argument("value")
    s.add_argument("--out", default="etiqueta.png")
    _add_config_args(s)

    b = sub.add_parser("batch", help="lote desde Excel/CSV")
    b.add_argument("file")
    b.add_argument("--column", required=True, help="nombre de cabecera o índice")
    b.add_argument("--out", default="etiquetas.zip")
    b.add_argument("--pdf", action="store_true", help="exporta hoja PDF en vez de ZIP")
    b.add_argument("--keep-duplicates", action="store_true")
    _add_config_args(b)

    args = parser.parse_args(argv)
    config = _config(args)

    try:
        if args.cmd == "single":
            config.validate()
            value = normalize_value(args.value, config)
            img = compose_label(value, config)
            img.save(args.out)
            print(f"Guardado: {args.out}")
            return 0

        if args.cmd == "batch":
            data = Path(args.file).read_bytes()
            col = int(args.column) if args.column.isdigit() else args.column
            if args.file.lower().endswith(".xlsx"):
                values = read_column_from_xlsx(data, col)
            elif args.file.lower().endswith(".csv"):
                values = read_column_from_csv(data, col)
            else:
                print("Formato no soportado (usa .xlsx o .csv)", file=sys.stderr)
                return 2

            result = generate_batch(
                values, config, dedupe=not args.keep_duplicates
            )
            if not result.images:
                print("No se generó ninguna etiqueta.", file=sys.stderr)
                return 1

            if args.pdf:
                Path(args.out).write_bytes(images_to_pdf_sheet(result.images, config))
            else:
                Path(args.out).write_bytes(images_to_zip(result.images))

            print(f"Generadas {len(result.images)} etiquetas -> {args.out}")
            if result.errors:
                print(f"{len(result.errors)} fila(s) con error:", file=sys.stderr)
                for val, reason in result.errors[:10]:
                    print(f"  - {val!r}: {reason}", file=sys.stderr)
            return 0
    except LabelError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
