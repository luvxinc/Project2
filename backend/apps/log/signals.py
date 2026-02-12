# File: backend/apps/log/signals.py
"""
日志系统信号处理器 - 自动捕获模型变更和认证事件
"""
from django.db.models.signals import post_save, post_delete, pre_delete
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver
from django.forms.models import model_to_dict

from .services import LogAuditService, LogBusinessService


# =============================================================================
# 认证信号 - 100% 自动
# =============================================================================

@receiver(user_logged_in)
def on_user_logged_in(sender, request, user, **kwargs):
    """用户登录成功"""
    try:
        LogAuditService.log_login_success(user, request)
    except Exception:
        pass  # 日志失败不应影响主业务


@receiver(user_logged_out)
def on_user_logged_out(sender, request, user, **kwargs):
    """用户登出"""
    try:
        if user:
            LogAuditService.log_logout(user, request)
    except Exception:
        pass


@receiver(user_login_failed)
def on_user_login_failed(sender, credentials, request, **kwargs):
    """用户登录失败"""
    try:
        username = credentials.get('username', 'unknown')
        LogAuditService.log_login_failed(username, request)
    except Exception:
        pass


# =============================================================================
# 模型删除信号 - 自动审计
# =============================================================================

# 需要审计的应用
AUDITED_APPS = {'purchase', 'finance', 'inventory', 'products', 'user_admin'}

# 排除的表（日志表本身等）
EXCLUDED_TABLES = {'log_error', 'log_audit', 'log_business', 'log_access', 'django_session'}


def _should_audit_model(sender) -> bool:
    """判断模型是否需要审计"""
    if sender._meta.db_table in EXCLUDED_TABLES:
        return False
    if sender._meta.app_label not in AUDITED_APPS:
        return False
    return True


def _safe_model_to_dict(instance) -> dict:
    """安全地将模型转为字典"""
    try:
        data = model_to_dict(instance)
        # 转换不可序列化的对象
        for key, value in data.items():
            if hasattr(value, 'pk'):
                data[key] = str(value.pk)
            elif hasattr(value, 'isoformat'):
                data[key] = value.isoformat()
        return data
    except Exception:
        return {'pk': str(instance.pk) if hasattr(instance, 'pk') else 'unknown'}


@receiver(pre_delete)
def on_model_pre_delete(sender, instance, **kwargs):
    """模型删除前 - 保存删除前状态"""
    if not _should_audit_model(sender):
        return
    
    # 将删除前状态暂存到实例上
    instance._pre_delete_state = _safe_model_to_dict(instance)


@receiver(post_delete)
def on_model_post_delete(sender, instance, **kwargs):
    """模型删除后 - 记录审计日志"""
    if not _should_audit_model(sender):
        return
    
    try:
        before_state = getattr(instance, '_pre_delete_state', None)
        
        LogAuditService.create(
            action=f'DELETE_{sender._meta.model_name.upper()}',
            action_category='DATA',
            target_type=sender._meta.model_name,
            target_id=str(instance.pk) if hasattr(instance, 'pk') else None,
            before_state=before_state,
            result='SUCCESS',
            risk_level='HIGH',
        )
    except Exception:
        pass


# =============================================================================
# 模型保存信号 - 业务日志
# =============================================================================

# 需要记录业务日志的模型
BUSINESS_LOG_MODELS = {
    # 采购模块
    'inboundpo': 'purchase',
    'inboundsend': 'purchase', 
    'inboundreceive': 'purchase',
    # 财务模块
    'logisticspayment': 'finance',
    'depositpayment': 'finance',
    # 用户模块
    'user_account': 'user_admin',
}


@receiver(post_save)
def on_model_post_save(sender, instance, created, **kwargs):
    """模型保存后 - 记录业务日志"""
    model_name = sender._meta.model_name.lower()
    
    if model_name not in BUSINESS_LOG_MODELS:
        return
    
    if sender._meta.db_table in EXCLUDED_TABLES:
        return
    
    try:
        action = f"CREATE_{model_name.upper()}" if created else f"UPDATE_{model_name.upper()}"
        module = BUSINESS_LOG_MODELS.get(model_name, 'system')
        
        # 获取目标 ID
        target_id = str(instance.pk) if hasattr(instance, 'pk') else None
        
        # 生成摘要
        if created:
            summary = f"创建 {sender._meta.verbose_name}: {target_id}"
        else:
            summary = f"更新 {sender._meta.verbose_name}: {target_id}"
        
        LogBusinessService.create(
            action=action,
            summary=summary,
            module=module,
            target_type=model_name,
            target_id=target_id,
            status='SUCCESS',
        )
    except Exception:
        pass
