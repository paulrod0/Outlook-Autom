# 📊 Generador de Códigos de Barras y QR (Lote e Individual)

Herramienta gratuita y sin suscripciones para generar etiquetas de códigos de
barras y QR de forma masiva o individual, pensada para almacenes y logística.

Sube un Excel/CSV, elige la columna de referencias y descarga todas las
etiquetas en un ZIP o en una hoja PDF lista para imprimir. También permite
crear etiquetas sueltas con previsualización en vivo.

## ✨ Funcionalidades

- **Lote**: carga `.xlsx` o `.csv`, selección de columna y generación automática.
- **Individual**: creación rápida con previsualización inmediata.
- **Dos formatos**: códigos QR y códigos de barras.
- **Segunda línea de texto** por etiqueta (descripción, precio, ubicación…).
- **Logo central en los QR** (con corrección de error H automática).
- **Plantillas predefinidas** Avery y Dymo para PDF imprimible.
- **Personalización en cm**: tamaño de etiqueta, alto del código, DPI y texto.
- **Exportación**: ZIP de PNG, **ZIP de SVG vectorial**, o **hoja PDF imprimible**.
- **Web y línea de comandos**: misma lógica para uso manual o automatizado.

## 🚀 Mejoras incorporadas sobre la versión inicial

1. **Varias simbologías con validación**: Code 128, Code 39, EAN-13, EAN-8,
   UPC-A e ISBN-13. Mensajes de error claros y **cálculo automático del dígito
   de control** EAN/UPC.
2. **CSV además de Excel**, con autodetección de separador (`,`, `;`, tab, `|`).
3. **Hoja PDF imprimible** (A4/Letter) en rejilla: imprime directamente sobre
   papel de etiquetas sin recolocar nada.
4. **Texto legible** bajo cada código, con recorte por elipsis si no cabe.
5. **Control de calidad de impresión (DPI)** y dimensiones reales en centímetros.
6. **Informe de errores por fila**: una referencia inválida no detiene el lote;
   se omite y se reporta el motivo.
7. **Omisión de duplicados** opcional.
8. **CLI para automatización** (Task Scheduler / cron), reutilizando el núcleo.
9. **Tests automatizados** del núcleo de generación.
10. **Segunda línea de texto** por etiqueta, leída de una segunda columna en lote.
11. **Logo central en QR**: incrusta una imagen y sube la corrección de error a H
    para mantener la legibilidad.
12. **Plantillas comerciales**: Avery 5160 / L7160 / L7651 y Dymo 99012 / 11354,
    con la geometría exacta de hoja o rollo para imprimir sin recolocar.
13. **Exportación SVG vectorial**: el código se dibuja con primitivas vectoriales,
    por lo que se imprime a cualquier escala sin pérdida de nitidez.

## 📦 Instalación

```bash
pip install -r requirements.txt
```

## 🖥️ Uso web

```bash
python -m barcode_qr_tool.app
# abre http://127.0.0.1:5000
```

## ⌨️ Uso por línea de comandos

```bash
# Lote desde Excel a ZIP de PNG (QR)
python -m barcode_qr_tool.cli batch refs.xlsx --column SKU --out etiquetas.zip

# Hoja PDF Avery L7160 de códigos de barras Code 128
python -m barcode_qr_tool.cli batch refs.csv --column 0 \
    --mode barcode --symbology code128 --pdf --template avery_l7160 --out hoja.pdf

# Lote con segunda línea (descripción) en SVG vectorial
python -m barcode_qr_tool.cli batch refs.xlsx --column SKU \
    --subtitle --subtitle-column Descripcion --svg --out etiquetas_svg.zip

# Etiqueta individual con logo central y subtítulo, en SVG
python -m barcode_qr_tool.cli single "https://miweb.com/ref/123" \
    --logo logo.png --subtitle --subtitle-text "Caja 12u" --out ref.svg
```

Opciones de configuración (`--width`, `--height`, `--bar-height`, `--dpi`,
`--no-text`, `--qr-error`, `--subtitle`, `--logo`) disponibles en ambos
subcomandos; `--template`, `--svg` y `--pdf` en el subcomando `batch`.

### Plantillas disponibles

`avery_5160` (30/hoja, Letter), `avery_l7160` (21/hoja, A4),
`avery_l7651` (65/hoja, A4), `dymo_99012` y `dymo_11354` (rollo).

## 🧪 Tests

```bash
python -m pytest barcode_qr_tool/tests/ -q
```

## 📁 Estructura

```
barcode_qr_tool/
├── app.py                # Servidor web Flask (modos individual y lote)
├── cli.py                # Interfaz de línea de comandos para automatización
├── generator.py          # Núcleo: validación, render (PNG/SVG) y exportación
├── templates_catalog.py  # Plantillas predefinidas Avery/Dymo
├── requirements.txt
├── templates/index.html
├── static/{style.css, app.js}
├── samples/              # Excel de ejemplo y su generador
└── tests/                # Pruebas del núcleo
```

## 🔭 Próximas mejoras posibles

- Más plantillas comerciales y editor de plantillas personalizadas.
- Códigos de barras 2D adicionales (DataMatrix, PDF417).
- Numeración correlativa automática y prefijos/sufijos.
