from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _

class EbayAccount(models.Model):
    """
    eBay 账户模型
    
    存储多个 eBay 账户的授权信息。
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ebay_accounts',
        verbose_name=_('关联系统用户'),
        help_text=_('授权此 eBay 账户的 ERP 用户')
    )
    
    # eBay 用户标识
    ebay_user_id = models.CharField(
        _('eBay 用户 ID'),
        max_length=255,
        unique=True,
        help_text=_('eBay 平台上的唯一用户标识 (如 eIAS Token 或用户名)')
    )
    ebay_username = models.CharField(
        _('eBay 用户名'),
        max_length=255,
        blank=True, 
        null=True
    )
    
    # 授权信息
    access_token = models.TextField(_('Access Token'))
    refresh_token = models.TextField(_('Refresh Token'), blank=True, null=True)
    token_expiry = models.DateTimeField(_('Token 过期时间'), blank=True, null=True)
    
    # 元数据
    environment = models.CharField(
        _('环境'),
        max_length=20,
        choices=[('sandbox', 'Sandbox'), ('production', 'Production')],
        default='production'
    )
    is_active = models.BooleanField(
        _('是否有效'),
        default=True
    )
    last_sync_at = models.DateTimeField(
        _('最后同步时间'),
        blank=True, 
        null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = _('eBay 账户')
        verbose_name_plural = _('eBay 账户')
        ordering = ['-created_at']
        
    def __str__(self):
        return self.ebay_username or self.ebay_user_id
