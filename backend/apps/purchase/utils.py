"""
采购模块通用工具函数

[P0-1 优化] 提取各模块的重复代码为可复用函数
"""
import re
from datetime import date


def extract_date_from_po_num(po_num: str) -> str:
    """
    从订单号中提取日期并转换为YYYY-MM-DD格式
    
    订单号格式: XXYYYYMMDD-S## 
    例如: AB20241228-S01 -> 2024-12-28
    
    其中:
    - XX: 厂商代码（任意字母）
    - YYYYMMDD: 日期
    - S##: 序号
    
    Args:
        po_num: 订单号字符串
        
    Returns:
        YYYY-MM-DD 格式的日期字符串，如果无法提取则返回空字符串
    """
    if not po_num:
        return ''
    
    try:
        # 使用正则表达式匹配：任意字母开头 + 8位数字（YYYYMMDD）
        # 模式：^[A-Za-z]+(\d{8})
        match = re.match(r'^[A-Za-z]+(\d{8})', str(po_num).strip())
        
        if match:
            date_str = match.group(1)  # 获取捕获组中的8位数字
            year = date_str[0:4]
            month = date_str[4:6]
            day = date_str[6:8]
            
            # 验证日期合法性
            year_int = int(year)
            month_int = int(month)
            day_int = int(day)
            
            if 2000 <= year_int <= 2099 and 1 <= month_int <= 12 and 1 <= day_int <= 31:
                return f"{year}-{month}-{day}"
        
        return ''
        
    except Exception:
        return ''


def get_next_seq(current_max_num: int, prefix: str = 'L') -> str:
    """
    根据当前最大序号生成下一个序号
    
    Args:
        current_max_num: 当前最大序号数字（如 5）
        prefix: 序号前缀（如 'L', 'S', 'V', 'D', 'P'）
        
    Returns:
        下一个序号字符串（如 'L06'）
    """
    next_num = current_max_num + 1
    return f"{prefix}{str(next_num).zfill(2)}"


def make_delete_note(operator: str, custom_note: str = '') -> str:
    """
    生成标准删除备注
    
    Args:
        operator: 操作人用户名
        custom_note: 自定义备注内容
        
    Returns:
        标准格式删除备注: "删除订单_{operator}_{custom_note}"
    """
    today = date.today().isoformat()
    if custom_note:
        return f"删除订单_{operator}_{custom_note}"
    return f"删除订单_{operator}_{today}"


def make_restore_note(operator: str) -> str:
    """
    生成标准恢复备注
    
    Args:
        operator: 操作人用户名
        
    Returns:
        标准格式恢复备注: "恢复删除_{operator}_{date}"
    """
    today = date.today().isoformat()
    return f"恢复删除_{operator}_{today}"


def inject_security_codes_to_post(request, data: dict):
    """
    将 JSON body 中的安全码注入到 request.POST
    用于 SecurityPolicyManager.verify_action_request 验证
    
    Args:
        request: Django request 对象
        data: 解析后的 JSON body（dict）
        
    Returns:
        原 request（已修改 POST 属性）
    """
    mutable_post = request.POST.copy()
    for key in ['sec_code_l0', 'sec_code_l1', 'sec_code_l2', 'sec_code_l3', 'sec_code_l4']:
        if key in data:
            mutable_post[key] = data[key]
    request.POST = mutable_post
    return request


def is_deleted_note(note: str) -> bool:
    """
    检查备注是否为删除标记
    
    Args:
        note: 备注内容
        
    Returns:
        True 如果备注以 "删除订单" 开头
    """
    return (note or '').startswith('删除订单')

