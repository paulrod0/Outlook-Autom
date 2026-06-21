"""Genera un Excel de ejemplo con referencias de almacén para probar el modo lote."""
import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Referencias"
ws.append(["SKU", "Descripcion", "Ubicacion"])
filas = [
    ("REF-00001", "Tornillo M6 x 40", "A-01-03"),
    ("REF-00002", "Tuerca M6", "A-01-04"),
    ("REF-00003", "Arandela plana", "A-02-01"),
    ("REF-00004", "Brida 200mm", "B-03-02"),
    ("REF-00005", "Cable 2.5mm azul", "C-01-05"),
]
for f in filas:
    ws.append(f)
wb.save("referencias_ejemplo.xlsx")
print("Creado samples/referencias_ejemplo.xlsx")
