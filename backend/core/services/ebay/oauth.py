# File: backend/core/services/ebay/oauth.py
"""
# ==============================================================================
# 模块名称: eBay OAuth 2.0 认证管理器 (OAuth Manager)
# ==============================================================================
#
# [Purpose / 用途]
# 管理 eBay OAuth 2.0 认证流程：
# - 生成授权 URL
# - 交换 Authorization Code 获取 Token
# - 刷新过期 Token
#
# [OAuth Flow / 认证流程]
# 1. 用户访问授权 URL → eBay 登录 → 授权
# 2. eBay 回调我们的 RuName URL，附带 Authorization Code
# 3. 用 Code 交换 Access Token + Refresh Token
# 4. Access Token 过期后，用 Refresh Token 刷新
#
# ==============================================================================
"""

import base64
import requests
from datetime import datetime, timedelta
from typing import Optional, Tuple
from urllib.parse import urlencode

from core.services.base import BaseService
from .config import EbayConfig


class EbayOAuthManager(BaseService):
    """
    eBay OAuth 2.0 认证管理器
    """
    
    def __init__(self, config: Optional[EbayConfig] = None):
        super().__init__()
        self.config = config or EbayConfig.get_sandbox_config()
    
    def _get_basic_auth_header(self) -> str:
        """
        生成 Basic Auth Header
        
        格式: Base64(app_id:cert_id)
        """
        credentials = f"{self.config.app_id}:{self.config.cert_id}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        生成用户授权 URL
        
        Args:
            state: CSRF 防护参数 (可选)
            
        Returns:
            授权 URL，用户需要在浏览器中访问此 URL
        """
        params = {
            "client_id": self.config.app_id,
            "response_type": "code",
            "redirect_uri": self.config.ru_name,
            "scope": self.config.scopes_string,
            "prompt": "login",
        }
        
        if state:
            params["state"] = state
        
        url = f"{self.config.auth_url}?{urlencode(params)}"
        self.log(f"🔗 Generated authorization URL for {self.config.environment.value}")
        return url
    
    def exchange_code_for_token(self, authorization_code: str) -> dict:
        """
        用 Authorization Code 交换 Access Token
        
        Args:
            authorization_code: 从回调 URL 获取的授权码
            
        Returns:
            {
                "access_token": str,
                "refresh_token": str,
                "expires_in": int,  # 秒
                "token_type": "User Access Token"
            }
        """
        self.log(f"🔄 Exchanging authorization code for token...")
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": self._get_basic_auth_header(),
        }
        
        data = {
            "grant_type": "authorization_code",
            "code": authorization_code,
            "redirect_uri": self.config.ru_name,
        }
        
        try:
            response = requests.post(
                self.config.token_url,
                headers=headers,
                data=data,
                timeout=30,
            )
            
            if response.status_code == 200:
                result = response.json()
                self._update_config_tokens(result)
                self.log(f"✅ Token obtained successfully! Expires in {result.get('expires_in', 0) // 3600} hours")
                return {
                    "success": True,
                    "access_token": result.get("access_token"),
                    "refresh_token": result.get("refresh_token"),
                    "expires_in": result.get("expires_in"),
                    "token_type": result.get("token_type"),
                }
            else:
                error = response.json() if response.text else {"error": "Unknown"}
                self.log(f"❌ Token exchange failed: {error}", level="error")
                return {
                    "success": False,
                    "error": error.get("error", "Unknown"),
                    "error_description": error.get("error_description", response.text),
                }
        
        except requests.RequestException as e:
            self.log(f"❌ Token exchange request failed: {e}", level="error")
            return {"success": False, "error": "request_failed", "error_description": str(e)}
    
    def refresh_access_token(self, refresh_token: Optional[str] = None) -> dict:
        """
        使用 Refresh Token 刷新 Access Token
        
        Args:
            refresh_token: Refresh Token (可选，默认使用配置中的)
            
        Returns:
            与 exchange_code_for_token 相同格式
        """
        token = refresh_token or self.config.refresh_token
        if not token:
            return {"success": False, "error": "no_refresh_token", "error_description": "Refresh token not available"}
        
        self.log(f"🔄 Refreshing access token...")
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": self._get_basic_auth_header(),
        }
        
        data = {
            "grant_type": "refresh_token",
            "refresh_token": token,
            "scope": self.config.scopes_string,
        }
        
        try:
            response = requests.post(
                self.config.token_url,
                headers=headers,
                data=data,
                timeout=30,
            )
            
            if response.status_code == 200:
                result = response.json()
                self._update_config_tokens(result)
                self.log(f"✅ Token refreshed! New expiry in {result.get('expires_in', 0) // 3600} hours")
                return {
                    "success": True,
                    "access_token": result.get("access_token"),
                    "refresh_token": result.get("refresh_token", token),  # 可能不返回新的
                    "expires_in": result.get("expires_in"),
                }
            else:
                error = response.json() if response.text else {"error": "Unknown"}
                self.log(f"❌ Token refresh failed: {error}", level="error")
                return {"success": False, "error": error.get("error"), "error_description": error.get("error_description")}
        
        except requests.RequestException as e:
            self.log(f"❌ Token refresh request failed: {e}", level="error")
            return {"success": False, "error": "request_failed", "error_description": str(e)}
    
    def _update_config_tokens(self, token_response: dict):
        """更新配置中的 Token"""
        self.config.user_access_token = token_response.get("access_token")
        if token_response.get("refresh_token"):
            self.config.refresh_token = token_response.get("refresh_token")
        
        # 计算过期时间
        expires_in = token_response.get("expires_in", 7200)
        expiry = datetime.now() + timedelta(seconds=expires_in)
        self.config.token_expiry = expiry.isoformat()
    
    def is_token_expired(self) -> bool:
        """检查 Token 是否过期"""
        if not self.config.token_expiry:
            return True
        
        try:
            expiry = datetime.fromisoformat(self.config.token_expiry)
            # 提前 5 分钟认为过期
            return datetime.now() > (expiry - timedelta(minutes=5))
        except ValueError:
            return True
    
    def ensure_valid_token(self) -> Tuple[bool, str]:
        """
        确保有有效的 Token
        
        如果过期，尝试刷新；如果无法刷新，返回 False
        
        Returns:
            (success: bool, access_token or error_message: str)
        """
        if not self.config.user_access_token:
            return False, "No access token. Please authorize first."
        
        if not self.is_token_expired():
            return True, self.config.user_access_token
        
        # 尝试刷新
        if self.config.refresh_token:
            result = self.refresh_access_token()
            if result.get("success"):
                return True, result["access_token"]
            else:
                return False, f"Token refresh failed: {result.get('error_description')}"
        
        return False, "Token expired and no refresh token available."

    def get_user_info(self, access_token: str) -> dict:
        """
        获取用户个人信息 (Identity API)
        """
        # [Fix] Identity API requires 'apiz' subdomain (Not api or apix)
        if self.config.is_sandbox:
            base_url = "https://apiz.sandbox.ebay.com"
        else:
            base_url = "https://apiz.ebay.com"
            
        url = f"{base_url}/commerce/identity/v1/user"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "EaglestarERP/1.0" 
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ User info retrieved: {data}")
                return data
            else:
                 error_msg = f"Failed to get user info: {response.status_code} {response.text}"
                 self.log(error_msg, level="error")
                 return {"error": "api_error", "details": response.text, "status_code": response.status_code, "url": url}
        except Exception as e:
            self.log(f"Error getting user info: {e}", level="error")
            return {"error": "exception", "details": str(e), "url": url}
