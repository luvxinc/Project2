# backend/apps/inventory/views/shelf.py
"""
仓库货架码管理 - 视图与API
"""
import json
import logging
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.utils.translation import gettext as _

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
def shelf_page(request):
    """仓库货架码管理页面"""
    return render(request, 'inventory/pages/shelf.html')


@login_required(login_url='web_ui:login')
@require_GET
def shelf_list_api(request):
    """
    获取所有仓库结构数据
    GET /dashboard/inventory/shelf/api/list/
    
    返回格式:
    {
        "success": True,
        "data": {
            "warehouses": {
                "WH01": {
                    "aisles": {
                        "L": {
                            "bays": {
                                "1": {
                                    "levels": {
                                        "G": {"bins": {"L": {"slots": ["L", "R"]}, "R": {...}}},
                                        "M": {...},
                                        "T": {...}
                                    }
                                },
                                "2": {...}
                            }
                        },
                        "R": {...}
                    }
                }
            }
        }
    }
    """
    try:
        df = DBClient.read_df("""
            SELECT wh_num, aisle, bay, level, bin, slot
            FROM in_mgmt_barcode
            ORDER BY wh_num, aisle, bay, level, bin, slot
        """)
        
        warehouses = {}
        
        for _idx, row in df.iterrows():
            wh = row['wh_num']
            aisle = row['aisle']
            bay = str(row['bay'])
            level = row['level']
            bin_val = row['bin'] if row['bin'] else None
            slot_val = row['slot'] if row['slot'] else None
            
            # 确保层级存在
            if wh not in warehouses:
                warehouses[wh] = {'aisles': {}}
            if aisle not in warehouses[wh]['aisles']:
                warehouses[wh]['aisles'][aisle] = {'bays': {}}
            if bay not in warehouses[wh]['aisles'][aisle]['bays']:
                warehouses[wh]['aisles'][aisle]['bays'][bay] = {'levels': {}}
            if level not in warehouses[wh]['aisles'][aisle]['bays'][bay]['levels']:
                warehouses[wh]['aisles'][aisle]['bays'][bay]['levels'][level] = {'bins': {}}
            
            level_data = warehouses[wh]['aisles'][aisle]['bays'][bay]['levels'][level]
            
            if bin_val:
                if bin_val not in level_data['bins']:
                    level_data['bins'][bin_val] = {'slots': []}
                if slot_val and slot_val not in level_data['bins'][bin_val]['slots']:
                    level_data['bins'][bin_val]['slots'].append(slot_val)
        
        # 计算每个仓库的统计信息
        warehouse_stats = {}
        for wh, wh_data in warehouses.items():
            stats = {
                'aisle_count': len(wh_data['aisles']),
                'total_bays': 0,
                'total_levels': 0,
                'total_locations': 0
            }
            for aisle, aisle_data in wh_data['aisles'].items():
                stats['total_bays'] += len(aisle_data['bays'])
                for bay, bay_data in aisle_data['bays'].items():
                    stats['total_levels'] += len(bay_data['levels'])
                    for level, level_data in bay_data['levels'].items():
                        if level_data['bins']:
                            for bin_key, bin_data in level_data['bins'].items():
                                if bin_data['slots']:
                                    stats['total_locations'] += len(bin_data['slots'])
                                else:
                                    stats['total_locations'] += 1
                        else:
                            stats['total_locations'] += 1
            warehouse_stats[wh] = stats
        
        return JsonResponse({
            'success': True,
            'data': {
                'warehouses': warehouses,
                'stats': warehouse_stats
            }
        })
        
    except Exception as e:
        logger.exception("获取仓库数据失败")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def shelf_create_api(request):
    """
    创建仓库结构
    POST /dashboard/inventory/shelf/api/create/
    
    请求参数:
    {
        "wh_num": "WH01",
        "aisles": {
            "L": {
                "bay_count": 3,
                "levels": ["G", "M", "T"],
                "bin_count": 2,  // 0 表示不区分
                "slot_count": 2  // 0 表示不区分
            },
            "R": {...}  // 可选
        }
    }
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    wh_num = data.get('wh_num', '').strip().upper()
    aisles_config = data.get('aisles', {})
    action = data.get('action', 'create')
    
    if not wh_num:
        return JsonResponse({'success': False, 'message': _('仓库号不能为空')}, status=400)
    
    if not aisles_config:
        return JsonResponse({'success': False, 'message': _('至少需要配置一个货架排')}, status=400)
    
    # 根据操作类型处理
    if action == 'update':
        # 更新模式：先删除旧数据
        DBClient.execute_stmt(
            "DELETE FROM in_mgmt_barcode WHERE wh_num = :wh_num",
            {'wh_num': wh_num}
        )
        logger.info(f"[Shelf] 更新仓库 {wh_num} - 旧数据已清除")
    else:
        # 创建模式：检查是否已存在
        existing = DBClient.read_df(
            "SELECT COUNT(*) as cnt FROM in_mgmt_barcode WHERE wh_num = :wh_num",
            {'wh_num': wh_num}
        )
        if existing.iloc[0]['cnt'] > 0:
            return JsonResponse({'success': False, 'message': _('仓库号 {wh_num} 已存在').format(wh_num=wh_num)}, status=400)
    
    username = request.user.username
    
    try:
        records = []
        
        for aisle, config in aisles_config.items():
            bay_count = int(config.get('bay_count', 1))
            
            # 默认配置
            default_levels = config.get('levels', ['G', 'M', 'T'])
            default_bin_count = int(config.get('bin_count', 0))
            default_slot_count = int(config.get('slot_count', 0))
            
            # 自定义跨配置
            custom_bays = config.get('custom_bays', {})
            
            for bay in range(1, bay_count + 1):
                # 确定当前跨的配置
                bay_key = str(bay)
                if bay_key in custom_bays:
                    bay_cfg = custom_bays[bay_key]
                    levels = bay_cfg.get('levels', default_levels)
                    bin_count = int(bay_cfg.get('bin_count', default_bin_count))
                    slot_count = int(bay_cfg.get('slot_count', default_slot_count))
                else:
                    levels = default_levels
                    bin_count = default_bin_count
                    slot_count = default_slot_count
                
                # 生成 bin 标签
                bin_labels = []
                if bin_count > 0:
                    bin_labels = ['L', 'R'][:bin_count] if bin_count <= 2 else [str(i) for i in range(1, bin_count + 1)]
                
                # 生成 slot 标签
                slot_labels = []
                if slot_count > 0:
                    slot_labels = ['L', 'R'][:slot_count] if slot_count <= 2 else [str(i) for i in range(1, slot_count + 1)]

                for level in levels:
                    if bin_labels:
                        for bin_val in bin_labels:
                            if slot_labels:
                                for slot_val in slot_labels:
                                    records.append({
                                        'wh_num': wh_num,
                                        'aisle': aisle,
                                        'bay': bay,
                                        'level': level,
                                        'bin': bin_val,
                                        'slot': slot_val
                                    })
                            else:
                                records.append({
                                    'wh_num': wh_num,
                                    'aisle': aisle,
                                    'bay': bay,
                                    'level': level,
                                    'bin': bin_val,
                                    'slot': ''
                                })
                    else:
                        records.append({
                            'wh_num': wh_num,
                            'aisle': aisle,
                            'bay': bay,
                            'level': level,
                            'bin': '',
                            'slot': ''
                        })
        
        # 批量插入
        for rec in records:
            DBClient.execute_stmt("""
                INSERT INTO in_mgmt_barcode (wh_num, aisle, bay, level, bin, slot)
                VALUES (:wh_num, :aisle, :bay, :level, :bin, :slot)
            """, rec)
        
        logger.info(f"[Shelf] 创建仓库 {wh_num}, {len(records)} 个库位, by {username}")
        
        return JsonResponse({
            'success': True,
            'message': _('成功创建仓库 {wh_num}，共 {count} 个库位').format(wh_num=wh_num, count=len(records)),
            'data': {'location_count': len(records)}
        })
        
    except Exception as e:
        logger.exception("创建仓库失败")
        return JsonResponse({'success': False, 'message': _('创建失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def shelf_delete_api(request):
    """
    删除仓库
    POST /dashboard/inventory/shelf/api/delete/
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    wh_num = data.get('wh_num', '').strip().upper()
    
    if not wh_num:
        return JsonResponse({'success': False, 'message': _('仓库号不能为空')}, status=400)
    
    try:
        result = DBClient.execute_stmt(
            "DELETE FROM in_mgmt_barcode WHERE wh_num = :wh_num",
            {'wh_num': wh_num}
        )
        
        logger.info(f"[Shelf] 删除仓库 {wh_num}, by {request.user.username}")
        
        return JsonResponse({
            'success': True,
            'message': _('成功删除仓库 {wh_num}').format(wh_num=wh_num)
        })
        
    except Exception as e:
        logger.exception("删除仓库失败")
        return JsonResponse({'success': False, 'message': _('删除失败: {error}').format(error=str(e))}, status=500)
