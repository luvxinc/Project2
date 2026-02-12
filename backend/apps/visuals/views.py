from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.http import HttpResponse, JsonResponse
from django.utils.translation import gettext as _
from datetime import date, timedelta, datetime
import json
import logging
import pandas as pd
import numpy as np

from core.services.visual_service import VisualService
from core.sys.logger import get_audit_logger
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()

# Mappings (UI Chinese Name -> Service Column Key)
ACTION_MAP = {
    "产品销售": "Sales", 
    "订单取消": "Cancel", 
    "无平台介入主动退货": "Return",
    "平台介入用户退货": "Request", 
    "平台介入强制退货": "Case", 
    "第三方仅退款": "Dispute"
}
# Shipping/Fees are global totals, prefixed with Total_ in DF
SHIP_MAP = {
    "普通邮递": "Total_ShipRegular", 
    "邮费罚款": "Total_ShipUnder",
    "邮费超支": "Total_ShipOver", 
    "包退货邮费": "Total_ShipReturn"
}
FEE_MAP = {
    "产品成本": "Total_COGS", 
    "平台费用": "Total_PlatformFee"
}

@login_required(login_url='web_ui:login')
def index(request):
    required_tokens = SecurityPolicyManager.get_required_tokens('btn_unlock_visuals')
    if not required_tokens:
        request.session['visuals_unlocked'] = True

    is_unlocked = request.session.get('visuals_unlocked', False)
    
    context = {
        "is_unlocked": is_unlocked,
        "default_start": (date.today() - timedelta(days=30)).strftime('%Y-%m-%d'),
        "default_end": date.today().strftime('%Y-%m-%d'),
    }
    return render(request, 'visuals/index.html', context)

@login_required(login_url='web_ui:login')
@require_POST
def unlock(request):
    # [Fix] 支持 JSON body 密码验证（参考密码策略.md 标准模式）
    json_data = None
    if request.content_type == 'application/json':
        try:
            json_data = json.loads(request.body.decode('utf-8'))
        except Exception:
            pass
    
    passed, reason = SecurityPolicyManager.verify_action_request(request, 'btn_unlock_visuals', json_data)
    if not passed:
        # [Fix] AJAX 请求返回 JSON，普通请求返回 HTML
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'message': reason}, status=403)
        return HttpResponse(f"<div class='text-danger mt-2'>{reason}</div>", status=403)
    
    request.session['visuals_unlocked'] = True
    request.session.modified = True  # [Fix] 确保 Session 被保存
    
    # [Fix] AJAX 请求返回 JSON，普通请求返回重定向
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({'success': True})
    return redirect('web_ui:sales:visuals:index')

@login_required(login_url='web_ui:login')
@require_GET
def get_chart_data(request):
    if not request.session.get('visuals_unlocked', False):
         if SecurityPolicyManager.get_required_tokens('btn_unlock_visuals'):
             return JsonResponse({"error": _("未解锁")}, status=403)

    try:
        start_str = request.GET.get('start')
        end_str = request.GET.get('end')
        stores = request.GET.getlist('stores[]')
        chart_type = request.GET.get('type', 'line')
        mode = request.GET.get('mode', 'Amount') # Amount, Quantity, Order, Percentage

        # --- Request Parsing ---
        if chart_type == 'pie':
            # Pie always uses specific hardcoded categories for logic
            # But we still need frontend labels if we want to debug. 
            # Actually we just need to ensure we fetch all data from Service.
            pass
        
        # User selections
        input_actions = request.GET.getlist('actions[]')
        input_ships = request.GET.getlist('ships[]')
        input_fees = request.GET.getlist('fees[]')
        
        if not start_str or not end_str or not stores:
            return JsonResponse({"error": _("缺少参数")}, status=400)
            
        s_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        e_date = datetime.strptime(end_str, '%Y-%m-%d').date()
        
        svc = VisualService()
        # Service uses its own filtering? load_and_aggregate(s, e, stores) gets everything by default?
        # Looking at Step 2172: it groups by UI_ACTION. It doesn't seem to filter by specific actions unless we pass them.
        # But load_and_aggregate signature in view_file 2172 didn't show params for filtering actions.
        # It showed `load_and_aggregate(self, start_date, end_date, stores)`.
        # So it returns ALL data. Filtering happens here in Views. Perfect.
        df, debug_sql = svc.load_and_aggregate(s_date, e_date, stores)
        
        if df.empty:
             return JsonResponse({"categories": [], "series": [], "pie_data": []})

        # --- BRANCH: PIE CHART ---
        if chart_type == 'pie':
            return JsonResponse(calculate_pie_data(df))

        # --- BRANCH: LINE CHART ---
        series_list = []
        is_qty = mode == 'Quantity'
        is_ord = mode == 'Order'
        is_pct = mode == 'Percentage'
        
        # Helper to get DF column name from UI Name
        def get_df_col(ui_name):
            if ui_name in ACTION_MAP:
                # Actions have metrics: Sales_Amount, Sales_Quantity, Sales_Order
                metric = mode
                if is_pct: metric = 'Amount' # % based on Amount
                return f"{ACTION_MAP[ui_name]}_{metric}"
            elif ui_name in SHIP_MAP and not (is_qty or is_ord):
                return SHIP_MAP[ui_name]
            elif ui_name in FEE_MAP and not (is_qty or is_ord):
                return FEE_MAP[ui_name]
            return None

        # Build list of requested columns
        # Filter Logic: Only show what user asked for.
        # EXCEPT: If mode is Percentage, we base it on Amount, but displayed as %.
        
        target_inputs = input_actions + input_ships + input_fees
        
        # Base for Percentage (Total Sales Amount)
        total_sales_base = 1.0
        if is_pct:
            sales_col = f"{ACTION_MAP['产品销售']}_Amount"
            if sales_col in df.columns:
                total_sales_base = df[sales_col].abs().replace(0, 1) # Vectorized division
        
        date_str_list = df['DateStr'].tolist()
        
        for ui in target_inputs:
            col = get_df_col(ui)
            if not col or col not in df.columns:
                continue
                
            vals = df[col].fillna(0)
            
            if is_pct:
                # If it's a cost, it might be negative in DB?
                # VisualService: sum(abs()) for COGS/Fees (lines 151, 161). So they are positive.
                # Sales is positive. Returns... 
                # Service GroupBy logic just sums 'revenue'. 
                # DB usually has negative revenue for returns.
                # If mapped to 'Amount', it's signed.
                # So we take abs() for % display? Or keep sign?
                # User requirement: "Zhanbi". Usually magnitude % of Sales.
                series_data = ((vals.abs() / total_sales_base) * 100).round(1).tolist()
            else:
                series_data = vals.round(2).tolist()
            
            series_list.append({
                "name": ui,
                "data": series_data
            })
            
        return JsonResponse({
            "categories": date_str_list,
            "series": series_list
        })
        
    except Exception as e:
        logger.error(f"Visuals Error: {e}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)

def calculate_pie_data(df):
    """
    Pie Chart Calculation based on specific formulas.
    All data derived from DF columns (Amount).
    """
    # 1. Aggregate to scalar sums
    sums = df.sum(numeric_only=True)
    def val(key): return sums.get(key, 0.0)
    
    # 2. Define Keys (Service Column Names)
    # Note: Pie is always Amount-based logic
    col_sales = "Sales_Amount"
    
    # Returns (Actions)
    # Mapped from "订单取消" -> "Cancel" -> "Cancel_Amount"
    ret_actions = ["Cancel", "Return", "Request", "Case", "Dispute"]
    col_returns = [f"{k}_Amount" for k in ret_actions]
    
    # Shipping
    # Mapped from SHIP_MAP
    col_ship_reg = "Total_ShipRegular"
    col_ship_fine = "Total_ShipUnder"
    col_ship_over = "Total_ShipOver"
    col_ship_ret = "Total_ShipReturn"
    
    # Fees
    col_cogs = "Total_COGS"
    col_fees = "Total_PlatformFee"
    
    # 3. Get Values (Signed from DB)
    # Check assumptions:
    # Sales: +
    # Returns: - (Usually negative revenue)
    # Ship/Fees: + (Service lines 151, 161 say .abs() for fees/cogs). 
    # Service line 174agg_rules: 'sum'. 
    # Let's assume Costs are POSITIVE magnitudes in the DF because of .abs(). 
    # Exception: Sales and Returns might be signed Revenue?
    # Actually, Aggregation rule 'revenue' sum. 
    # Returns in 'order_items' usually have negative price?
    # Let's assume Returns are NEGATIVE in 'Amount' column.
    
    v_sales = val(col_sales) # +
    
    # Net Returns
    # Formula: Sum of returns.
    # If they are negative, we Abs them for the Pie Slice (magnitude).
    # But for Net Sales calculation (Sales - Returns), if Returns are negative, we ADD them?
    # User Formula: "Net Sales : Product Sales - Order Cancel..."
    # This implies Order Cancel is POSITIVE magnitude.
    # So I will apply ABS to everything to be safe and treat them as magnitudes.
    
    v_ret_mag = sum(abs(val(c)) for c in col_returns)
    
    # Shipping
    # Formula: Regular + Fine - Overpay + ReturnLabel
    # All Abs magnitudes
    v_ship_val = abs(val(col_ship_reg)) + abs(val(col_ship_fine)) - abs(val(col_ship_over)) + abs(val(col_ship_ret))
    
    # Costs
    v_cogs_val = abs(val(col_cogs))
    v_fees_val = abs(val(col_fees))
    
    # Net Sales Formula: Sales - Returns - Shipping - COGS - Fees
    v_net_sales = v_sales - v_ret_mag - v_ship_val - v_cogs_val - v_fees_val
    
    # Percentage Denominator: "Product Sales"
    denom = v_sales if v_sales != 0 else 1.0
    
    def mk_slice(name, value, details=None):
        return {
            "name": name,
            "value": round(value, 2),
            "percentage": round((value / denom * 100), 1),
            "details": details or {}
        }

    pie_data = []
    
    # 1. Net Sales
    pie_data.append(mk_slice(_("净销售"), v_net_sales))
    
    # 2. Net Returns
    # Detail mapping back to Chinese
    ret_map_cn = {
        "Cancel_Amount": "订单取消", "Return_Amount": "无平台介入主动退货",
        "Request_Amount": "平台介入用户退货", "Case_Amount": "平台介入强制退货",
        "Dispute_Amount": "第三方仅退款"
    }
    ret_details = {}
    for c in col_returns:
        mag = abs(val(c))
        if mag > 0.01:
            cn_name = ret_map_cn.get(c, c)
            ret_details[cn_name] = round(mag, 2)
            
    pie_data.append(mk_slice(_("净退货"), v_ret_mag, ret_details))
    
    # 3. Shipping
    ship_details = {
        "普通邮递": round(abs(val(col_ship_reg)), 2),
        "邮费罚款": round(abs(val(col_ship_fine)), 2),
        "邮费超支": round(abs(val(col_ship_over)), 2),
        "包退货邮费": round(abs(val(col_ship_ret)), 2)
    }
    pie_data.append(mk_slice(_("物流费用"), v_ship_val, ship_details))
    
    # 4. COGS
    pie_data.append(mk_slice(_("产品成本"), v_cogs_val))
    
    # 5. Fees
    pie_data.append(mk_slice(_("平台佣金"), v_fees_val))
    
    return {"pie_data": pie_data}
