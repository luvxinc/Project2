"""
订单管理 - 订单详情和下载
"""
import logging

import os
import openpyxl
from openpyxl.styles import Font
from django.conf import settings as django_settings
from django.http import JsonResponse, FileResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _
import json

from ..hub import check_perm
from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def po_detail_api(request):
    """
    获取单个订单详情
    URL: /dashboard/purchase/api/po_mgmt/detail/?po_num=xxx
    
    数据来源:
    - 商品列表: 直接从 in_po_final 读取（快照表，已聚合）
    - 版本号/备注/操作人: 从 in_po_final 中 po_seq 最大的记录获取
    - 删除判定: in_po_final 为空则为已删除订单
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        # 1. 获取订单基础信息（从 in_po 的初始记录获取）
        base_df = DBClient.read_df("""
            SELECT supplier_code, update_date as order_date
            FROM in_po 
            WHERE po_num = :po_num AND action = 'new' AND seq = 'L01'
            LIMIT 1
        """, {'po_num': po_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('订单不存在')}, status=404)
        
        base_info = {
            'po_num': po_num,
            'supplier_code': base_df.iloc[0]['supplier_code'],
            'order_date': str(base_df.iloc[0]['order_date'])
        }
        
        # 2. 获取最新策略信息
        strategy_df = DBClient.read_df("""
            SELECT * FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'po_num': po_num})
        
        strategy_info = {}
        if not strategy_df.empty:
            row = strategy_df.iloc[0]
            strategy_info = {
                'seq': row['seq'],
                'date': str(row['date']),
                'by': row['by'],
                'note': row.get('note', ''),
                'currency': row['cur_currency'],
                'exchange_rate': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 0,
                'float_enabled': bool(row['cur_float']),
                'float_threshold': float(row['cur_ex_float']) if row['cur_ex_float'] else 0,
                'deposit_enabled': bool(row['cur_deposit']),
                'deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0
            }
        
        # 3. 直接从 in_po_final 读取商品列表
        final_df = DBClient.read_df("""
            SELECT po_sku, po_quantity, po_price, po_note, po_seq, po_by, po_update_date
            FROM in_po_final
            WHERE po_num = :po_num
            ORDER BY po_sku, po_price
        """, {'po_num': po_num})
        
        # 4. 判断删除状态
        is_deleted = final_df.empty
        delete_reason = 'no_items' if is_deleted else None
        
        # 5. 获取最新版本信息（po_seq 最大的记录）
        detail_seq = 'L01'
        detail_date = None
        detail_by = None
        detail_note = None
        
        if not final_df.empty:
            # 找到 po_seq 最大的记录
            max_seq_row = None
            max_seq_num = 0
            for _idx, row in final_df.iterrows():
                seq = row['po_seq'] or 'L01'
                try:
                    seq_num = int(seq.replace('L', ''))
                except:
                    seq_num = 0
                if seq_num >= max_seq_num:
                    max_seq_num = seq_num
                    max_seq_row = row
            
            if max_seq_row is not None:
                detail_seq = max_seq_row['po_seq'] or 'L01'
                detail_date = str(max_seq_row['po_update_date']) if max_seq_row['po_update_date'] else None
                detail_by = max_seq_row['po_by']
                detail_note = max_seq_row['po_note']
        
        # 6. 构建商品列表
        currency = strategy_info.get('currency', 'RMB')
        usd_rmb = strategy_info.get('exchange_rate', 7.0) or 7.0
        
        items_list = []
        total_amount = 0
        
        for _idx, row in final_df.iterrows():
            qty = int(row['po_quantity']) if row['po_quantity'] else 0
            unit_price = float(row['po_price']) if row['po_price'] else 0
            
            # 跳过数量为0的商品
            if qty == 0:
                continue
            
            item_value = qty * unit_price
            total_amount += item_value
            
            if currency == 'USD':
                value_usd = round(item_value, 5)
                value_rmb = round(item_value * usd_rmb, 5)
            else:
                value_rmb = round(item_value, 5)
                value_usd = round(item_value / usd_rmb, 5) if usd_rmb > 0 else 0
            
            items_list.append({
                'sku': row['po_sku'],
                'qty': qty,
                'unit_price': unit_price,
                'currency': currency,
                'value_rmb': value_rmb,
                'value_usd': value_usd
            })
        
        # 7. 计算双货币总价
        if currency == 'USD':
            total_usd = round(total_amount, 5)
            total_rmb = round(total_amount * usd_rmb, 5)
        else:
            total_rmb = round(total_amount, 5)
            total_usd = round(total_amount / usd_rmb, 5) if usd_rmb > 0 else 0
        
        detail_info = {
            'seq': detail_seq,
            'date': detail_date,
            'by': detail_by,
            'note': detail_note,
            'total_amount': round(total_amount, 5),
            'total_rmb': total_rmb,
            'total_usd': total_usd,
            'items': items_list,
            'currency': currency,
            'usd_rmb': usd_rmb
        }
        
        return JsonResponse({
            'success': True,
            'data': {
                'base': base_info,
                'strategy': strategy_info,
                'detail': detail_info,
                'is_deleted': is_deleted,
                'delete_reason': delete_reason
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单详情失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def download_po_excel_api(request):
    """
    下载订单Excel文件
    URL: /dashboard/purchase/api/po_mgmt/download/?po_num=xxx
    
    使用模板 data/templates_csv/in_po_output.xlsx 生成Excel文件
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        # 1. 获取订单基础信息
        base_df = DBClient.read_df("""
            SELECT supplier_code, update_date as order_date
            FROM in_po 
            WHERE po_num = :po_num AND action = 'new' AND seq = 'L01'
            LIMIT 1
        """, {'po_num': po_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('订单不存在')}, status=404)
        
        supplier_code = base_df.iloc[0]['supplier_code']
        order_date = str(base_df.iloc[0]['order_date'])
        
        # 2. 获取最新策略信息
        strategy_df = DBClient.read_df("""
            SELECT * FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'po_num': po_num})
        
        strategy_info = {}
        if not strategy_df.empty:
            row = strategy_df.iloc[0]
            strategy_info = {
                'seq': row['seq'],
                'date': str(row['date']),
                'by': row['by'],
                'note': row.get('note', '') or '',
                'currency': row['cur_currency'],
                'exchange_rate': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 0,
                'float_enabled': bool(row['cur_float']),
                'float_threshold': float(row['cur_ex_float']) if row['cur_ex_float'] else 0,
                'deposit_enabled': bool(row['cur_deposit']),
                'deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0
            }
        
        # 3. 直接从 in_po_final 读取商品数据
        final_df = DBClient.read_df("""
            SELECT po_sku, po_quantity, po_price, po_note, po_seq, po_by, po_update_date
            FROM in_po_final
            WHERE po_num = :po_num
            ORDER BY po_sku, po_price
        """, {'po_num': po_num})
        
        # 判断删除状态
        is_deleted = final_df.empty
        delete_date = None
        
        # 获取最新版本信息
        detail_seq = 'L01'
        detail_date = None
        detail_by = None
        detail_note = None
        
        if not final_df.empty:
            max_seq_num = 0
            for _idx, row in final_df.iterrows():
                seq = row['po_seq'] or 'L01'
                try:
                    seq_num = int(seq.replace('L', ''))
                except:
                    seq_num = 0
                if seq_num >= max_seq_num:
                    max_seq_num = seq_num
                    detail_seq = seq
                    detail_date = str(row['po_update_date']) if row['po_update_date'] else None
                    detail_by = row['po_by']
                    detail_note = row['po_note']
        
        # 构建商品列表并计算总额
        items = []
        total_amount = 0
        for _idx, row in final_df.iterrows():
            qty = int(row['po_quantity']) if row['po_quantity'] else 0
            if qty > 0:
                items.append({
                    'sku': row['po_sku'],
                    'qty': qty,
                    'unit_price': float(row['po_price']) if row['po_price'] else 0
                })
                total_amount += qty * (float(row['po_price']) if row['po_price'] else 0)
        
        # 4. 加载模板
        template_path = os.path.join(django_settings.BASE_DIR, '..', 'data', 'templates_csv', 'in_po_output.xlsx')
        wb = openpyxl.load_workbook(template_path)
        sheet = wb.active
        
        # 辅助函数：安全写入单元格
        def safe_write(cell_ref, value):
            cell = sheet[cell_ref]
            if isinstance(cell, openpyxl.cell.cell.MergedCell):
                for merged_range in sheet.merged_cells.ranges:
                    if cell.coordinate in merged_range:
                        top_left = sheet.cell(row=merged_range.min_row, column=merged_range.min_col)
                        top_left.value = value
                        return
            cell.value = value
        
        # 5. 如果订单被删除，在顶部添加删除提示
        if is_deleted:
            sheet.insert_rows(1)
            sheet['B1'] = f'订单被删除 删除日期 {delete_date or "N/A"}'
            sheet['B1'].font = Font(color='FF0000', bold=True, size=14)
        
        # 6. 写入数据 (行号因插入而可能偏移)
        offset = 1 if is_deleted else 0
        
        # 订单基础信息
        safe_write(f'C{4+offset}', supplier_code)
        safe_write(f'F{4+offset}', order_date)
        safe_write(f'C{6+offset}', po_num)
        
        # 订单策略信息
        safe_write(f'F{8+offset}', strategy_info.get('seq', '-'))
        safe_write(f'C{10+offset}', strategy_info.get('by', '-'))
        safe_write(f'F{10+offset}', strategy_info.get('date', '-'))
        safe_write(f'C{12+offset}', strategy_info.get('note', '-'))
        safe_write(f'C{14+offset}', strategy_info.get('currency', '-'))
        safe_write(f'F{14+offset}', strategy_info.get('exchange_rate', '-'))
        safe_write(f'C{16+offset}', '是' if strategy_info.get('float_enabled') else '否')
        safe_write(f'F{16+offset}', f"{strategy_info.get('float_threshold', 0)}%")
        safe_write(f'C{18+offset}', '是' if strategy_info.get('deposit_enabled') else '否')
        safe_write(f'F{18+offset}', f"{strategy_info.get('deposit_par', 0)}%")
        
        # 订单明细信息
        safe_write(f'F{20+offset}', detail_seq)
        safe_write(f'C{22+offset}', detail_by or '-')
        safe_write(f'F{22+offset}', detail_date or '-')
        safe_write(f'C{24+offset}', detail_note or '-')
        safe_write(f'C{26+offset}', f"{strategy_info.get('currency', 'RMB')} {total_amount:,.2f}")
        
        # 写入SKU列表
        start_row = 29 + offset
        currency = strategy_info.get('currency', 'RMB')
        
        if is_deleted:
            # 订单被删除时，商品列表为空
            sheet[f'B{start_row}'] = '(订单已删除，无明细数据)'
            sheet[f'B{start_row}'].font = Font(color='FF0000', italic=True)
        else:
            # items 已经是列表，直接遍历
            for idx, item in enumerate(items):
                row = start_row + idx
                sheet[f'B{row}'] = item['sku']
                sheet[f'C{row}'] = item['qty']
                sheet[f'D{row}'] = currency
                sheet[f'E{row}'] = item['unit_price']
                sheet[f'F{row}'] = round(item['qty'] * item['unit_price'], 5)
        
        # 7. 使用临时文件（响应后自动删除）
        import tempfile
        
        # 创建临时文件
        temp_fd, temp_path = tempfile.mkstemp(suffix='.xlsx')
        try:
            os.close(temp_fd)  # 关闭文件描述符，让openpyxl写入
            wb.save(temp_path)
            
            # 读取文件内容到内存
            with open(temp_path, 'rb') as f:
                file_content = f.read()
        finally:
            # 无论如何都删除临时文件
            try:
                os.unlink(temp_path)
            except:
                pass
        
        # 8. 返回文件下载（使用内存中的内容）
        from django.http import HttpResponse
        response = HttpResponse(
            file_content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{po_num}_current.xlsx"'
        return response
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('生成订单文件失败: {error}').format(error=str(e))
        }, status=500)
