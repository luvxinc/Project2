# File: backend/core/services/ebay/config.py
"""
# ==============================================================================
# 模块名称: eBay API 配置管理 (eBay Config)
# ==============================================================================
#
# [Purpose / 用途]
# 管理 eBay API 凭证和端点配置。
# 支持 Sandbox 和 Production 环境切换。
#
# [Security / 安全]
# - API 凭证通过环境变量或数据库加载
# - User Access Token 存储在数据库中 (加密)
#
# ==============================================================================
"""

import os
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class EbayEnvironment(Enum):
    """eBay API 环境"""
    SANDBOX = "sandbox"
    PRODUCTION = "production"


@dataclass
class EbayConfig:
    """
    eBay API 配置类
    
    Attributes:
        app_id: eBay App ID (Client ID)
        cert_id: eBay Cert ID (Client Secret)  
        dev_id: eBay Developer ID
        ru_name: Redirect URL Name
        environment: API 环境 (sandbox/production)
    """
    app_id: str = ""
    cert_id: str = ""
    dev_id: str = ""
    ru_name: str = ""
    environment: EbayEnvironment = EbayEnvironment.SANDBOX
    
    # OAuth Tokens (运行时填充)
    user_access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expiry: Optional[str] = None
    
    def __post_init__(self):
        """从环境变量加载默认值"""
        if not self.app_id:
            self.app_id = os.getenv("EBAY_APP_ID", "")
        if not self.cert_id:
            self.cert_id = os.getenv("EBAY_CERT_ID", "")
        if not self.dev_id:
            self.dev_id = os.getenv("EBAY_DEV_ID", "")
        if not self.ru_name:
            self.ru_name = os.getenv("EBAY_RU_NAME", "")
        
        env_str = os.getenv("EBAY_ENVIRONMENT", "sandbox").lower()
        if env_str == "production":
            self.environment = EbayEnvironment.PRODUCTION
    
    @property
    def is_sandbox(self) -> bool:
        return self.environment == EbayEnvironment.SANDBOX
    
    @property
    def api_base_url(self) -> str:
        """API 基础 URL (api subdomain)"""
        if self.is_sandbox:
            return "https://api.sandbox.ebay.com"
        return "https://api.ebay.com"
    
    @property
    def apiz_base_url(self) -> str:
        """API 基础 URL (apiz subdomain) - 用于 Finances, Identity 等 API"""
        if self.is_sandbox:
            return "https://apiz.sandbox.ebay.com"
        return "https://apiz.ebay.com"
    
    @property
    def auth_url(self) -> str:
        """OAuth 授权 URL"""
        if self.is_sandbox:
            return "https://auth.sandbox.ebay.com/oauth2/authorize"
        return "https://auth.ebay.com/oauth2/authorize"
    
    @property
    def token_url(self) -> str:
        """Token 交换 URL"""
        if self.is_sandbox:
            return "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
        return "https://api.ebay.com/identity/v1/oauth2/token"
    
    @property
    def scopes(self) -> list:
        """OAuth Scopes"""
        return [
            "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
            "https://api.ebay.com/oauth/api_scope/sell.finances",
            "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
            "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.payment.dispute",
        ]
    
    @property
    def scopes_string(self) -> str:
        """Scopes 空格分隔字符串"""
        return " ".join(self.scopes)
    
    def is_configured(self) -> bool:
        """检查是否已配置必要凭证"""
        return all([self.app_id, self.cert_id, self.dev_id, self.ru_name])
    
    def has_valid_token(self) -> bool:
        """检查是否有有效的 Access Token"""
        # TODO: 检查 token_expiry
        return bool(self.user_access_token)
    
    @classmethod
    def from_database(cls, seller_id: str) -> 'EbayConfig':
        """
        从数据库加载卖家配置
        
        Args:
            seller_id: eBay 卖家 ID
            
        Returns:
            EbayConfig 实例
        """
        # TODO: 实现数据库查询
        # 临时返回环境变量配置
        return cls()
    
    @classmethod
    def get_sandbox_config(cls) -> 'EbayConfig':
        """
        获取 Sandbox 测试配置
        
        使用硬编码的测试凭证 (仅开发用)
        """
        return cls(
            app_id=os.getenv("EBAY_SANDBOX_APP_ID", ""),
            cert_id=os.getenv("EBAY_SANDBOX_CERT_ID", ""),
            dev_id=os.getenv("EBAY_DEV_ID", ""),
            ru_name=os.getenv("EBAY_SANDBOX_RU_NAME", ""),
            environment=EbayEnvironment.SANDBOX,
        )
    
    @classmethod
    def get_production_config(cls) -> 'EbayConfig':
        """
        获取 Production 配置
        
        使用真实的 eBay 凭证
        """
        return cls(
            app_id=os.getenv("EBAY_PROD_APP_ID", ""),
            cert_id=os.getenv("EBAY_PROD_CERT_ID", ""),
            dev_id=os.getenv("EBAY_DEV_ID", ""),
            ru_name=os.getenv("EBAY_PROD_RU_NAME", ""),
            environment=EbayEnvironment.PRODUCTION,
        )
    
    @classmethod
    def get_config(cls) -> 'EbayConfig':
        """
        获取当前活动配置
        
        根据环境变量 EBAY_ENVIRONMENT 选择 Production 或 Sandbox。
        默认使用 Production。
        """
        env = os.getenv("EBAY_ENVIRONMENT", "production").lower()
        if env == "sandbox":
            return cls.get_sandbox_config()
        return cls.get_production_config()

