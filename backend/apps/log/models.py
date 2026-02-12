# File: backend/apps/log/models.py
"""
企业级日志系统 - 数据模型
四表架构: error, audit, business, access
"""
from django.db import models
from django.conf import settings


class LogError(models.Model):
    """
    错误日志 - 记录所有系统异常
    触发方式: 全自动 (GlobalExceptionMiddleware)
    保留周期: 永久
    """
    
    class Severity(models.TextChoices):
        CRITICAL = 'CRITICAL', '严重'
        HIGH = 'HIGH', '高'
        MEDIUM = 'MEDIUM', '中'
        LOW = 'LOW', '低'
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='创建时间')
    
    # 链路追踪
    trace_id = models.CharField(max_length=36, db_index=True, verbose_name='链路ID')
    
    # 身份信息
    user = models.CharField(max_length=64, default='System', verbose_name='用户')
    ip = models.CharField(max_length=45, blank=True, null=True, verbose_name='IP地址')
    user_agent = models.CharField(max_length=512, blank=True, null=True, verbose_name='User-Agent')
    session_id = models.CharField(max_length=64, blank=True, null=True, verbose_name='Session ID')
    
    # 请求上下文
    http_method = models.CharField(max_length=8, blank=True, null=True, verbose_name='HTTP方法')
    request_path = models.CharField(max_length=512, blank=True, null=True, db_index=True, verbose_name='请求路径')
    query_params = models.TextField(blank=True, null=True, verbose_name='Query参数')
    request_body = models.TextField(blank=True, null=True, verbose_name='请求体')
    request_headers = models.TextField(blank=True, null=True, verbose_name='请求头')
    content_type = models.CharField(max_length=128, blank=True, null=True, verbose_name='Content-Type')
    
    # 错误信息
    error_type = models.CharField(max_length=256, verbose_name='异常类型')
    error_message = models.TextField(verbose_name='错误消息')
    error_code = models.CharField(max_length=32, blank=True, null=True, verbose_name='错误码')
    
    # 完整堆栈
    traceback_full = models.TextField(blank=True, null=True, verbose_name='完整堆栈')
    
    # 位置信息
    file_path = models.CharField(max_length=512, blank=True, null=True, verbose_name='文件路径')
    function_name = models.CharField(max_length=128, blank=True, null=True, verbose_name='函数名')
    line_number = models.IntegerField(blank=True, null=True, verbose_name='行号')
    module_name = models.CharField(max_length=128, blank=True, null=True, verbose_name='模块名')
    
    # 上下文变量
    local_variables = models.TextField(blank=True, null=True, verbose_name='局部变量')
    
    # 分类
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.HIGH, db_index=True, verbose_name='严重程度')
    category = models.CharField(max_length=64, blank=True, null=True, verbose_name='分类')
    
    # 管理字段
    is_resolved = models.BooleanField(default=False, db_index=True, verbose_name='已解决')
    resolved_by = models.CharField(max_length=64, blank=True, null=True, verbose_name='解决人')
    resolved_at = models.DateTimeField(blank=True, null=True, verbose_name='解决时间')
    resolution_note = models.TextField(blank=True, null=True, verbose_name='解决备注')
    
    # 开发模式
    dev_mode = models.BooleanField(default=False, db_index=True, verbose_name='开发模式')
    
    # 聚合
    error_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True, verbose_name='错误哈希')
    
    class Meta:
        db_table = 'log_error'
        verbose_name = '错误日志'
        verbose_name_plural = '错误日志'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['severity', 'is_resolved']),
        ]


class LogAudit(models.Model):
    """
    安全审计日志 - 记录敏感操作
    触发方式: 自动 (Signals) + 装饰器
    保留周期: 永久
    """
    
    class ActionCategory(models.TextChoices):
        AUTH = 'AUTH', '认证'
        AUTHZ = 'AUTHZ', '授权'
        DATA = 'DATA', '数据'
        CONFIG = 'CONFIG', '配置'
        ADMIN = 'ADMIN', '管理'
    
    class Result(models.TextChoices):
        SUCCESS = 'SUCCESS', '成功'
        DENIED = 'DENIED', '拒绝'
        FAILED = 'FAILED', '失败'
    
    class RiskLevel(models.TextChoices):
        CRITICAL = 'CRITICAL', '严重'
        HIGH = 'HIGH', '高'
        MEDIUM = 'MEDIUM', '中'
        LOW = 'LOW', '低'
    
    class LogType(models.TextChoices):
        REGULAR = 'REGULAR', '常规'
        PERMANENT = 'PERMANENT', '永久'
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='创建时间')
    
    # 链路追踪
    trace_id = models.CharField(max_length=36, db_index=True, verbose_name='链路ID')
    event_id = models.CharField(max_length=16, blank=True, null=True, verbose_name='事件ID')
    
    # 操作人
    actor_id = models.IntegerField(blank=True, null=True, verbose_name='操作人ID')
    actor_username = models.CharField(max_length=64, db_index=True, verbose_name='操作人用户名')
    actor_role = models.CharField(max_length=32, blank=True, null=True, verbose_name='操作人角色')
    actor_ip = models.CharField(max_length=45, blank=True, null=True, verbose_name='操作人IP')
    
    # 操作详情
    action = models.CharField(max_length=64, db_index=True, verbose_name='动作')
    action_category = models.CharField(max_length=16, choices=ActionCategory.choices, blank=True, null=True, verbose_name='动作分类')
    
    # 操作目标
    target_type = models.CharField(max_length=64, blank=True, null=True, verbose_name='目标类型')
    target_id = models.CharField(max_length=128, blank=True, null=True, verbose_name='目标ID')
    target_name = models.CharField(max_length=256, blank=True, null=True, verbose_name='目标名称')
    
    # 变更详情
    before_state = models.JSONField(blank=True, null=True, verbose_name='变更前状态')
    after_state = models.JSONField(blank=True, null=True, verbose_name='变更后状态')
    change_summary = models.CharField(max_length=512, blank=True, null=True, verbose_name='变更摘要')
    
    # 结果
    result = models.CharField(max_length=16, choices=Result.choices, verbose_name='结果')
    deny_reason = models.CharField(max_length=256, blank=True, null=True, verbose_name='拒绝原因')
    fail_reason = models.CharField(max_length=256, blank=True, null=True, verbose_name='失败原因')
    
    # 风险标记
    risk_level = models.CharField(max_length=16, choices=RiskLevel.choices, default=RiskLevel.MEDIUM, verbose_name='风险等级')
    
    # 合规字段
    log_type = models.CharField(max_length=16, choices=LogType.choices, default=LogType.REGULAR, verbose_name='日志类型')
    
    # 开发模式
    dev_mode = models.BooleanField(default=False, db_index=True, verbose_name='开发模式')
    
    class Meta:
        db_table = 'log_audit'
        verbose_name = '安全审计日志'
        verbose_name_plural = '安全审计日志'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['actor_username', 'created_at']),
        ]


class LogBusiness(models.Model):
    """
    业务操作日志 - 记录有价值的业务操作
    触发方式: 自动 (Signals) + 装饰器
    保留周期: 90 天
    """
    
    class Status(models.TextChoices):
        SUCCESS = 'SUCCESS', '成功'
        FAILED = 'FAILED', '失败'
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='创建时间')
    
    # 链路追踪
    trace_id = models.CharField(max_length=36, db_index=True, verbose_name='链路ID')
    event_id = models.CharField(max_length=16, blank=True, null=True, verbose_name='事件ID')
    
    # 操作人
    user = models.CharField(max_length=64, db_index=True, verbose_name='用户')
    ip = models.CharField(max_length=45, blank=True, null=True, verbose_name='IP地址')
    
    # 业务上下文
    module = models.CharField(max_length=32, db_index=True, verbose_name='模块')
    page_path = models.CharField(max_length=256, blank=True, null=True, verbose_name='页面路径')
    
    # 操作详情
    action = models.CharField(max_length=64, db_index=True, verbose_name='动作')
    target_type = models.CharField(max_length=64, blank=True, null=True, verbose_name='目标类型')
    target_id = models.CharField(max_length=128, blank=True, null=True, verbose_name='目标ID')
    
    # 内容
    summary = models.CharField(max_length=256, verbose_name='摘要')
    details = models.JSONField(blank=True, null=True, verbose_name='详情')
    
    # 状态
    status = models.CharField(max_length=16, choices=Status.choices, verbose_name='状态')
    duration_ms = models.IntegerField(blank=True, null=True, verbose_name='耗时(ms)')
    
    # 开发模式
    dev_mode = models.BooleanField(default=False, db_index=True, verbose_name='开发模式')
    
    class Meta:
        db_table = 'log_business'
        verbose_name = '业务操作日志'
        verbose_name_plural = '业务操作日志'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['module', 'action']),
        ]


class LogAccess(models.Model):
    """
    访问日志 - 记录 HTTP 请求（精简版）
    触发方式: 全自动 (AccessLogMiddleware)
    保留周期: 30 天
    """
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='创建时间')
    
    # 链路追踪
    trace_id = models.CharField(max_length=36, db_index=True, verbose_name='链路ID')
    
    # 身份
    user = models.CharField(max_length=64, blank=True, null=True, verbose_name='用户')
    ip = models.CharField(max_length=45, verbose_name='IP地址')
    user_agent = models.CharField(max_length=512, blank=True, null=True, verbose_name='User-Agent')
    
    # 请求
    method = models.CharField(max_length=8, verbose_name='HTTP方法')
    path = models.CharField(max_length=512, db_index=True, verbose_name='请求路径')
    query_string = models.CharField(max_length=1024, blank=True, null=True, verbose_name='Query参数')
    request_size = models.IntegerField(blank=True, null=True, verbose_name='请求大小')
    
    # 响应
    status_code = models.IntegerField(db_index=True, verbose_name='状态码')
    response_size = models.IntegerField(blank=True, null=True, verbose_name='响应大小')
    response_time_ms = models.IntegerField(db_index=True, verbose_name='响应时间(ms)')
    
    # 开发模式
    dev_mode = models.BooleanField(default=False, db_index=True, verbose_name='开发模式')
    
    class Meta:
        db_table = 'log_access'
        verbose_name = '访问日志'
        verbose_name_plural = '访问日志'
        ordering = ['-created_at']
