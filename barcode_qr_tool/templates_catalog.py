"""
Plantillas de etiquetas predefinidas (Avery, Dymo, etc.).

Cada plantilla define la geometría exacta de una hoja o rollo de etiquetas
comercial, de modo que el PDF generado encaje al imprimir sin recolocar nada.

Las hojas (Avery) usan papel A4/Letter con una rejilla de columnas y filas.
Los rollos (Dymo) imprimen una etiqueta por "página" del tamaño de la propia
etiqueta (``page="label"``).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LabelTemplate:
    display_name: str
    page: str  # "A4", "letter" o "label" (página = tamaño de la etiqueta)
    label_w_cm: float
    label_h_cm: float
    cols: int
    rows: int
    margin_left_cm: float = 0.0
    margin_top_cm: float = 0.0
    gap_x_cm: float = 0.0
    gap_y_cm: float = 0.0


# Especificaciones de fabricante (valores nominales).
LABEL_TEMPLATES: dict[str, LabelTemplate] = {
    "avery_5160": LabelTemplate(
        display_name="Avery 5160 — 30/hoja (Letter)",
        page="letter",
        label_w_cm=6.67, label_h_cm=2.54,
        cols=3, rows=10,
        margin_left_cm=0.48, margin_top_cm=1.27,
        gap_x_cm=0.32, gap_y_cm=0.0,
    ),
    "avery_l7160": LabelTemplate(
        display_name="Avery L7160 — 21/hoja (A4)",
        page="A4",
        label_w_cm=6.35, label_h_cm=3.81,
        cols=3, rows=7,
        margin_left_cm=0.72, margin_top_cm=1.51,
        gap_x_cm=0.25, gap_y_cm=0.0,
    ),
    "avery_l7651": LabelTemplate(
        display_name="Avery L7651 — 65/hoja (A4)",
        page="A4",
        label_w_cm=3.81, label_h_cm=2.12,
        cols=5, rows=13,
        margin_left_cm=0.46, margin_top_cm=1.08,
        gap_x_cm=0.25, gap_y_cm=0.0,
    ),
    "dymo_99012": LabelTemplate(
        display_name="Dymo 99012 — dirección grande (rollo)",
        page="label",
        label_w_cm=8.9, label_h_cm=3.6,
        cols=1, rows=1,
    ),
    "dymo_11354": LabelTemplate(
        display_name="Dymo 11354 — multiuso (rollo)",
        page="label",
        label_w_cm=5.7, label_h_cm=3.2,
        cols=1, rows=1,
    ),
}


def get_template(key: str) -> LabelTemplate:
    if key not in LABEL_TEMPLATES:
        raise KeyError(key)
    return LABEL_TEMPLATES[key]
