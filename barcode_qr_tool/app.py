"""
Aplicación web (Flask) del Generador de Códigos de Barras y QR.

Modos:
  * Individual: una etiqueta, previsualización y descarga inmediata.
  * Lote: subida de Excel/CSV, elección de columna y descarga en ZIP/PDF/SVG.

Funciones avanzadas: segunda línea de texto, logo central en QR, plantillas
predefinidas (Avery/Dymo) y exportación SVG vectorial.

Arranque local:
    python -m barcode_qr_tool.app      # o:  python app.py
y abrir http://127.0.0.1:5000
"""

from __future__ import annotations

import io

from flask import Flask, jsonify, render_template, request, send_file

from .generator import (
    BARCODE_SYMBOLOGIES,
    QR_ERROR_LEVELS,
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
    xlsx_headers,
)
from .templates_catalog import LABEL_TEMPLATES, get_template

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB


def _config_from_form(form, logo_bytes: bytes | None = None) -> LabelConfig:
    def fnum(key, default):
        try:
            return float(form.get(key, default))
        except (TypeError, ValueError):
            return default

    def flag(key, default="false"):
        return form.get(key, default) in ("true", "on", "1", "True")

    config = LabelConfig(
        mode=form.get("mode", "qr"),
        symbology=form.get("symbology", "code128"),
        label_width_cm=fnum("label_width_cm", 5.0),
        label_height_cm=fnum("label_height_cm", 3.0),
        bar_height_cm=fnum("bar_height_cm", 1.5),
        dpi=int(fnum("dpi", 300)),
        show_text=flag("show_text", "true"),
        qr_error=form.get("qr_error", "M"),
        font_size_pt=fnum("font_size_pt", 10.0),
        show_subtitle=flag("show_subtitle"),
        subtitle_font_size_pt=fnum("subtitle_font_size_pt", 8.0),
        logo_bytes=logo_bytes,
    )

    # Una plantilla fija el tamaño de etiqueta para que encaje en la hoja/rollo.
    tpl_key = form.get("template", "")
    if tpl_key:
        try:
            tpl = get_template(tpl_key)
            config.label_width_cm = tpl.label_w_cm
            config.label_height_cm = tpl.label_h_cm
        except KeyError:
            raise LabelError(f"Plantilla desconocida: {tpl_key!r}")
    return config


@app.route("/")
def index():
    return render_template(
        "index.html",
        symbologies=BARCODE_SYMBOLOGIES,
        qr_levels=list(QR_ERROR_LEVELS.keys()),
        templates={k: v.display_name for k, v in LABEL_TEMPLATES.items()},
    )


@app.route("/api/preview", methods=["POST"])
def preview():
    """Devuelve un PNG (o SVG) de una sola etiqueta para previsualizar."""
    try:
        logo = request.files.get("logo")
        logo_bytes = logo.read() if logo and logo.filename else None
        config = _config_from_form(request.form, logo_bytes=logo_bytes)
        config.validate()
        value = normalize_value(request.form.get("value", ""), config)
        subtitle = request.form.get("subtitle", "") or None
        if request.form.get("format") == "svg":
            svg = compose_label_svg(value, config, subtitle=subtitle)
            return app.response_class(svg, mimetype="image/svg+xml")
        img = compose_label(value, config, subtitle=subtitle)
    except LabelError as exc:
        return jsonify({"error": str(exc)}), 400

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/api/columns", methods=["POST"])
def columns():
    """Lista las cabeceras de un archivo subido para elegir la columna."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No se ha subido ningún archivo."}), 400
    data = file.read()
    name = (file.filename or "").lower()
    try:
        if name.endswith(".xlsx"):
            headers = xlsx_headers(data)
        elif name.endswith(".csv"):
            import csv

            text = data.decode("utf-8-sig", errors="replace")
            reader = csv.reader(io.StringIO(text))
            headers = next(reader, [])
        else:
            return jsonify({"error": "Formato no soportado. Usa .xlsx o .csv"}), 400
    except Exception as exc:
        return jsonify({"error": f"No se pudo leer el archivo: {exc}"}), 400
    return jsonify({"columns": headers})


@app.route("/api/batch", methods=["POST"])
def batch():
    """Genera todas las etiquetas y devuelve ZIP (PNG/SVG) o PDF."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No se ha subido ningún archivo."}), 400
    column = request.form.get("column", "")
    subtitle_col = request.form.get("subtitle_column", "")
    output = request.form.get("output", "zip")  # "zip" | "pdf" | "svg"
    dedupe = request.form.get("dedupe", "true") in ("true", "on", "1")

    data = file.read()
    name = (file.filename or "").lower()
    try:
        col: str | int = int(column) if column.isdigit() else column
        sub: str | int | None = int(subtitle_col) if subtitle_col.isdigit() else (subtitle_col or None)
        if name.endswith(".xlsx"):
            values, subtitles = read_two_columns_xlsx(data, col, sub)
        elif name.endswith(".csv"):
            values, subtitles = read_two_columns_csv(data, col, sub)
        else:
            return jsonify({"error": "Formato no soportado. Usa .xlsx o .csv"}), 400

        logo = request.files.get("logo")
        logo_bytes = logo.read() if logo and logo.filename else None
        config = _config_from_form(request.form, logo_bytes=logo_bytes)

        if output == "svg":
            svgs, errors = generate_batch_svg(values, config, dedupe=dedupe, subtitles=subtitles)
            if not svgs:
                return jsonify({"error": _no_output_msg(errors)}), 400
            payload = svgs_to_zip(svgs)
            mimetype, fname, gen, err = "application/zip", "etiquetas_svg.zip", len(svgs), len(errors)
        else:
            result = generate_batch(values, config, dedupe=dedupe, subtitles=subtitles)
            if not result.images:
                return jsonify({"error": _no_output_msg(result.errors)}), 400
            if output == "pdf":
                tpl_key = request.form.get("template", "")
                tpl = get_template(tpl_key) if tpl_key else None
                payload = images_to_pdf_sheet(result.images, config, template=tpl)
                mimetype, fname = "application/pdf", "etiquetas.pdf"
            else:
                payload = images_to_zip(result.images)
                mimetype, fname = "application/zip", "etiquetas.zip"
            gen, err = len(result.images), len(result.errors)
    except LabelError as exc:
        return jsonify({"error": str(exc)}), 400

    buf = io.BytesIO(payload)
    buf.seek(0)
    resp = send_file(buf, mimetype=mimetype, as_attachment=True, download_name=fname)
    resp.headers["X-Generated-Count"] = str(gen)
    resp.headers["X-Error-Count"] = str(err)
    return resp


def _no_output_msg(errors) -> str:
    msg = "No se generó ninguna etiqueta."
    if errors:
        msg += f" Errores: {len(errors)}. Primero: {errors[0][1]}"
    return msg


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
