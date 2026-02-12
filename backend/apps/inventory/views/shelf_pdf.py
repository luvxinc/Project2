# backend/apps/inventory/views/shelf_pdf.py
import io
import json
import logging
import zipfile
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

from core.components.db.client import DBClient

# Try importing standard barcode libs
try:
    from reportlab.graphics.barcode import createBarcodeDrawing
    BARCODE_LIB = 'reportlab'
except ImportError:
    BARCODE_LIB = None

logger = logging.getLogger(__name__)


# ============================================================
# Helper Functions
# ============================================================

def _map_side(v):
    """Map L/R to Left/Right"""
    if v == 'L': return 'Left'
    if v == 'R': return 'Right'
    return str(v) if v else 'N/A'

def _map_level(v):
    """Map G/M/T to Ground/Middle/Top"""
    if v == 'G': return 'Ground'
    if v == 'M': return 'Middle'
    if v == 'T': return 'Top'
    return str(v) if v else 'N/A'

def _code_val(v):
    """Return string or 'null' for empty values"""
    return str(v) if v else "null"

def _draw_label_on_half(c, side, wh, aisle, bay, level, bin_val, slot_val):
    """
    Draw a single label on one half of the page.
    side: 'left' or 'right'
    """
    # Display values
    disp_wh = str(wh) if wh else ""
    disp_aisle = _map_side(aisle)
    disp_bay = str(bay) if bay else ""
    disp_level = _map_level(level)
    disp_bin = _map_side(bin_val) if bin_val else None
    disp_slot = _map_side(slot_val) if slot_val else None
    
    # Barcode string
    barcode_str = f"location_{_code_val(wh)}_{_code_val(aisle)}_{_code_val(bay)}_{_code_val(level)}_{_code_val(bin_val)}_{_code_val(slot_val)}"
    
    c.saveState()
    
    # Transform based on side
    if side == 'left':
        # Left half: translate to top-left, rotate -90
        c.translate(0, 6 * inch)
        c.rotate(-90)
    else:
        # Right half: translate to top-right (at X=4), rotate -90
        c.translate(2 * inch, 6 * inch)
        c.rotate(-90)
    
    # --- DataMatrix ---
    dm_size = 1.2 * inch
    dm_x = 0.4 * inch
    dm_y = 0.4 * inch
    
    if BARCODE_LIB:
        try:
            barcode = createBarcodeDrawing('ECC200DataMatrix', value=barcode_str, width=dm_size, height=dm_size)
            barcode.drawOn(c, dm_x, dm_y)
        except Exception as e:
            logger.error(f"Barcode gen error: {e}")
            c.setFont("Helvetica-Bold", 10)
            c.drawString(dm_x, dm_y + dm_size/2, "ERR")
    
    # --- Text Fields ---
    x_col1 = 2.0 * inch
    x_col2 = 3.5 * inch
    x_col3 = 4.7 * inch
    
    y_row1 = 1.4 * inch
    y_row2 = 0.9 * inch
    y_row3 = 0.4 * inch
    
    c.setFillColorRGB(0, 0, 0)
    
    def draw_field(x, y, label, value):
        c.setFont("Helvetica", 10)
        c.drawString(x, y, label)
        label_w = c.stringWidth(label, "Helvetica", 10)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(x + label_w + 4, y, value)
    
    # Row 1: Warehouse
    draw_field(x_col1, y_row1, "Warehouse:", disp_wh)
    
    # Row 2: Bay, Aisle, Bin
    draw_field(x_col1, y_row2, "Bay:", disp_bay)
    draw_field(x_col2, y_row2, "Aisle:", disp_aisle)
    if disp_bin:
        draw_field(x_col3, y_row2, "Bin:", disp_bin)
    
    # Row 3: Level, Slot
    draw_field(x_col1, y_row3, "Level:", disp_level)
    if disp_slot:
        draw_field(x_col2, y_row3, "Slot:", disp_slot)
    
    c.restoreState()


# ============================================================
# Single Label Download API
# ============================================================

@login_required(login_url='web_ui:login')
@require_POST
def shelf_download_barcode(request):
    try:
        data = json.loads(request.body)
        wh = data.get('wh_num')
        aisle = data.get('aisle')
        bay = data.get('bay')
        level = data.get('level')
        bin_val = data.get('bin')
        slot_val = data.get('slot')

        filename = f"{_code_val(wh)}_{_code_val(aisle)}_{_code_val(bay)}_{_code_val(level)}_{_code_val(bin_val)}_{_code_val(slot_val)}.pdf"

        # PDF Setup
        page_w = 4 * inch
        page_h = 6 * inch
        
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=(page_w, page_h))
        
        # Draw split line
        c.setDash(4, 4)
        c.setLineWidth(1)
        c.line(2 * inch, 0, 2 * inch, 6 * inch)
        c.setDash()
        
        # Draw label on left half only
        _draw_label_on_half(c, 'left', wh, aisle, bay, level, bin_val, slot_val)
        
        c.showPage()
        c.save()
        
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    except Exception as e:
        logger.exception("PDF Generation Failed")
        return HttpResponse(json.dumps({'error': str(e)}), status=500, content_type='application/json')


# ============================================================
# Batch Download All Barcodes API
# ============================================================

@login_required(login_url='web_ui:login')
@require_GET
def shelf_download_all(request):
    """
    Download all warehouse barcodes as a ZIP file.
    Each warehouse generates one PDF with 2 labels per page.
    """
    try:
        # Read all barcode data
        df = DBClient.read_df("""
            SELECT wh_num, aisle, bay, level, bin, slot
            FROM in_mgmt_barcode
            ORDER BY wh_num, aisle, bay, level, bin, slot
        """)
        
        if df.empty:
            return HttpResponse(json.dumps({'error': 'No barcode data found'}), status=404, content_type='application/json')
        
        # Group by wh_num
        grouped = df.groupby('wh_num')
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for wh_num, group_df in grouped:
                # Create PDF for this warehouse
                pdf_buffer = io.BytesIO()
                page_w = 4 * inch
                page_h = 6 * inch
                c = canvas.Canvas(pdf_buffer, pagesize=(page_w, page_h))
                
                rows = group_df.to_dict('records')
                
                for i in range(0, len(rows), 2):
                    # Draw split line
                    c.setDash(4, 4)
                    c.setLineWidth(1)
                    c.line(2 * inch, 0, 2 * inch, 6 * inch)
                    c.setDash()
                    
                    # Left half (first row)
                    row1 = rows[i]
                    _draw_label_on_half(
                        c, 'left',
                        row1['wh_num'], row1['aisle'], row1['bay'],
                        row1['level'], row1.get('bin'), row1.get('slot')
                    )
                    
                    # Right half (second row, if exists)
                    if i + 1 < len(rows):
                        row2 = rows[i + 1]
                        _draw_label_on_half(
                            c, 'right',
                            row2['wh_num'], row2['aisle'], row2['bay'],
                            row2['level'], row2.get('bin'), row2.get('slot')
                        )
                    
                    c.showPage()
                
                c.save()
                pdf_buffer.seek(0)
                
                # Add to ZIP
                pdf_filename = f"{wh_num}.pdf"
                zf.writestr(pdf_filename, pdf_buffer.read())
        
        zip_buffer.seek(0)
        
        response = HttpResponse(zip_buffer, content_type='application/zip')
        response['Content-Disposition'] = 'attachment; filename="warehouse_code.zip"'
        return response

    except Exception as e:
        logger.exception("Batch PDF Generation Failed")
        return HttpResponse(json.dumps({'error': str(e)}), status=500, content_type='application/json')

