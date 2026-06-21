"""Pruebas del núcleo de generación. Ejecutar con:  python -m pytest"""

import io
import zipfile

import pytest

from barcode_qr_tool.generator import (
    LabelConfig,
    LabelError,
    cm_to_px,
    compose_label,
    generate_batch,
    images_to_pdf_sheet,
    images_to_zip,
    normalize_value,
    read_column_from_csv,
)


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
