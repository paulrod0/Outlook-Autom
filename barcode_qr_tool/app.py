"""
Aplicación web (Flask) del Generador de Códigos de Barras y QR.

Modos:
  * Individual: una etiqueta, previsualización y descarga inmediata.
  * Lote: subida de Excel/CSV, elección de columna y descarga en ZIP o PDF.

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
    generate_batch,
    images_to_pdf_sheet,
    images_to_zip,
    normalize_value,
    read_column_from_csv,
    read_column_from_xlsx,
    xlsx_headers,
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB


def _config_from_form(form) -> LabelConfig:
    def fnum(key, default):
        try:
            return float(form.get(key, default))
        except (TypeError, ValueError):
            return default

    return LabelConfig(
        mode=form.get("mode", "qr"),
        symbology=form.get("symbology", "code128"),
        label_width_cm=fnum("label_width_cm", 5.0),
        label_height_cm=fnum("label_height_cm", 3.0),
        bar_height_cm=fnum("bar_height_cm", 1.5),
        dpi=int(fnum("dpi", 300)),
        show_text=form.get("show_text", "true") in ("true", "on", "1", "True"),
        qr_error=form.get("qr_error", "M"),
        font_size_pt=fnum("font_size_pt", 10.0),
    )


@app.route("/")
def index():
    return render_template(
        "index.html",
        symbologies=BARCODE_SYMBOLOGIES,
        qr_levels=list(QR_ERROR_LEVELS.keys()),
    )


@app.route("/api/preview", methods=["POST"])
def preview():
    """Devuelve un PNG de una sola etiqueta para previsualizar."""
    try:
        config = _config_from_form(request.form)
        config.validate()
        value = normalize_value(request.form.get("value", ""), config)
        img = compose_label(value, config)
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
    """Genera todas las etiquetas y devuelve ZIP o PDF."""
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No se ha subido ningún archivo."}), 400
    column = request.form.get("column", "")
    output = request.form.get("output", "zip")  # "zip" | "pdf"
    dedupe = request.form.get("dedupe", "true") in ("true", "on", "1")

    data = file.read()
    name = (file.filename or "").lower()
    try:
        col: str | int = int(column) if column.isdigit() else column
        if name.endswith(".xlsx"):
            values = read_column_from_xlsx(data, col)
        elif name.endswith(".csv"):
            values = read_column_from_csv(data, col)
        else:
            return jsonify({"error": "Formato no soportado. Usa .xlsx o .csv"}), 400

        config = _config_from_form(request.form)
        result = generate_batch(values, config, dedupe=dedupe)
    except LabelError as exc:
        return jsonify({"error": str(exc)}), 400

    if not result.images:
        msg = "No se generó ninguna etiqueta."
        if result.errors:
            msg += f" Errores: {len(result.errors)}. Primero: {result.errors[0][1]}"
        return jsonify({"error": msg}), 400

    if output == "pdf":
        payload = images_to_pdf_sheet(result.images, config)
        mimetype, fname = "application/pdf", "etiquetas.pdf"
    else:
        payload = images_to_zip(result.images)
        mimetype, fname = "application/zip", "etiquetas.zip"

    buf = io.BytesIO(payload)
    buf.seek(0)
    resp = send_file(buf, mimetype=mimetype, as_attachment=True, download_name=fname)
    resp.headers["X-Generated-Count"] = str(len(result.images))
    resp.headers["X-Error-Count"] = str(len(result.errors))
    return resp


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
