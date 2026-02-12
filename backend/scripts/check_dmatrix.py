
try:
    from reportlab.graphics.barcode import createBarcodeDrawing
    from reportlab.graphics.shape import Drawing
    
    d = createBarcodeDrawing('MakeDataMatrix', value='TEST')
    print("DataMatrix available via createBarcodeDrawing")
except Exception as e:
    print(f"Standard createBarcodeDrawing error: {e}")

try:
    from reportlab.graphics.barcode.dmatrix import DataMatrix
    print("DataMatrix available via direct import")
except ImportError as e:
    print(f"Direct import error: {e}")
