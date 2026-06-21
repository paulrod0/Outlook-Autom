"""Pruebas del núcleo de generación. Ejecutar con:  python -m pytest"""

import io
import zipfile
from xml.dom import minidom

import pytest
from PIL import Image

from barcode_qr_tool.generator import (
    LabelConfig,
    LabelError,
    cm_to_px,
    compose_label,
    compose_label_svg,
    generate_batch,
    generate_batch_svg,
    images_to_pdf_sheet,
    images_to_zip,
    normalize_value,
    read_column_from_csv,
    read_two_columns_csv,
    svgs_to_zip,
)
from barcode_qr_tool.templates_catalog import get_template


def test_cm_to_px():
    assert cm_to_px(2.54, 300) == 300
    assert cm_to_px(1, 300) == 118


def test_qr_label_dimensions():
    cfg = LabelConfig(mode="qr", label_width_cm=5, label_height_cm=3, dpi=300)
    img = compose_label("REF-123", cfg)
    assert img.size == (cm_to_px(5, 300), cm_to_px(3, 300))


def test_barcode_code128():
    cfg = LabelConfig(mode="barcode", symbology="code128")
    img = compose_label("ABC-001", cfg)
    assert img.width > 0 and img.height > 0


def test_ean13_checksum_autocomplete():
    cfg = LabelConfig(mode="barcode", symbology="ean13")
    # 12 dígitos -> autocompleta el 13º (control)
    assert normalize_value("123456789012", cfg) == "1234567890128"


def test_ean13_invalid_length():
    cfg = LabelConfig(mode="barcode", symbology="ean13")
    with pytest.raises(LabelError):
        normalize_value("123", cfg)


def test_validation_rejects_oversized_code():
    cfg = LabelConfig(label_height_cm=2, bar_height_cm=5)
    with pytest.raises(LabelError):
        cfg.validate()


def test_batch_collects_errors():
    cfg = LabelConfig(mode="barcode", symbology="ean13")
    result = generate_batch(["123456789012", "no-valido", "  "], cfg)
    assert len(result.images) == 1
    assert len(result.errors) == 1
    assert result.errors[0][0] == "no-valido"


def test_batch_dedupe():
    cfg = LabelConfig(mode="qr")
    result = generate_batch(["A", "A", "B"], cfg, dedupe=True)
    assert len(result.images) == 2


def test_zip_export():
    cfg = LabelConfig(mode="qr")
    result = generate_batch(["A", "B"], cfg)
    data = images_to_zip(result.images)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert len(zf.namelist()) == 2
        assert all(n.endswith(".png") for n in zf.namelist())


def test_pdf_export():
    cfg = LabelConfig(mode="qr")
    result = generate_batch(["A", "B", "C"], cfg)
    data = images_to_pdf_sheet(result.images, cfg)
    assert data[:4] == b"%PDF"


def test_read_csv_column_by_name():
    csv_bytes = b"SKU;Nombre\nREF1;Tornillo\nREF2;Tuerca\n"
    assert read_column_from_csv(csv_bytes, "SKU") == ["REF1", "REF2"]


# --- Mejoras: subtítulo, logo, SVG, plantillas ---------------------------


def test_subtitle_does_not_break_layout():
    cfg = LabelConfig(mode="qr", show_subtitle=True)
    img = compose_label("REF-1", cfg, subtitle="Tornillo M6 - A-01-03")
    assert img.size == (cm_to_px(5, 300), cm_to_px(3, 300))


def test_logo_forces_h_and_renders():
    buf = io.BytesIO()
    Image.new("RGB", (80, 80), "red").save(buf, "PNG")
    cfg = LabelConfig(mode="qr", logo_bytes=buf.getvalue())
    img = compose_label("https://x.com/1", cfg)
    assert img.width > 0


def test_invalid_logo_raises():
    cfg = LabelConfig(mode="qr", logo_bytes=b"not-an-image")
    with pytest.raises(LabelError):
        compose_label("REF-1", cfg)


def test_svg_qr_is_valid_xml():
    svg = compose_label_svg("REF-1", LabelConfig(mode="qr"))
    assert minidom.parseString(svg) is not None
    assert "<rect" in svg and svg.startswith("<svg")


def test_svg_barcode_is_valid_xml():
    svg = compose_label_svg("REF-1", LabelConfig(mode="barcode", symbology="code128"))
    assert minidom.parseString(svg) is not None


def test_svg_escapes_text():
    svg = compose_label_svg("A&B<C", LabelConfig(mode="qr"))
    assert "&amp;" in svg and "&lt;" in svg
    assert minidom.parseString(svg) is not None


def test_generate_batch_svg_and_zip():
    svgs, errors = generate_batch_svg(["A", "B"], LabelConfig(mode="qr"))
    assert len(svgs) == 2 and not errors
    data = svgs_to_zip(svgs)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert all(n.endswith(".svg") for n in zf.namelist())


def test_batch_with_subtitles_aligned():
    cfg = LabelConfig(mode="qr", show_subtitle=True)
    result = generate_batch(["A", "B"], cfg, subtitles=["uno", "dos"])
    assert len(result.images) == 2


def test_read_two_columns_csv():
    csv_bytes = b"SKU;Desc\nREF1;Tornillo\nREF2;Tuerca\n"
    values, subs = read_two_columns_csv(csv_bytes, "SKU", "Desc")
    assert values == ["REF1", "REF2"]
    assert subs == ["Tornillo", "Tuerca"]


def test_pdf_with_template():
    cfg = LabelConfig(mode="barcode", symbology="code128")
    result = generate_batch([f"REF-{i:03d}" for i in range(40)], cfg)
    pdf = images_to_pdf_sheet(result.images, cfg, template=get_template("avery_5160"))
    assert pdf[:4] == b"%PDF"


def test_pdf_template_dymo_roll():
    cfg = LabelConfig(mode="qr")
    result = generate_batch(["A", "B"], cfg)
    pdf = images_to_pdf_sheet(result.images, cfg, template=get_template("dymo_99012"))
    assert pdf[:4] == b"%PDF"
