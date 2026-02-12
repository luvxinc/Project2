# File: backend/core/services/ebay/client.py
"""
# ==============================================================================
# 模块名称: eBay API 通用客户端 (API Client)
# ==============================================================================
#
# [Purpose / 用途]
# 封装 eBay REST API 通用请求逻辑：
# - 自动添加认证头
# - 统一错误处理
# - 请求重试机制
# - 分页处理
#
# ==============================================================================
"""

import requests
from typing import Optional, Dict, Any, List
from urllib.parse import urljoin

from core.services.base import BaseService
from .config import EbayConfig
from .oauth import EbayOAuthManager


class EbayAPIClient(BaseService):
    """
    eBay API 通用客户端
    
    所有 API 调用都通过此客户端进行，确保认证和错误处理一致。
    """
    
    def __init__(self, config: Optional[EbayConfig] = None):
        super().__init__()
        self.config = config or EbayConfig.get_sandbox_config()
        self.oauth = EbayOAuthManager(self.config)
        self.session = requests.Session()
        self._setup_session()
    
    def _setup_session(self):
        """配置 Session 默认参数"""
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Language": "en-US",
        })
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """获取认证头"""
        success, token_or_error = self.oauth.ensure_valid_token()
        if not success:
            raise PermissionError(f"eBay authentication failed: {token_or_error}")
        
        return {"Authorization": f"Bearer {token_or_error}"}
    
    def request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        data: Optional[Dict] = None,
        headers: Optional[Dict] = None,
        retry_count: int = 2,
    ) -> Dict[str, Any]:
        """
        发送 API 请求
        
        Args:
            method: HTTP 方法 (GET, POST, PUT, DELETE)
            endpoint: API 端点 (不含 base URL)
            params: URL 查询参数
            data: 请求体 (JSON)
            headers: 额外的请求头
            retry_count: 重试次数
            
        Returns:
            {
                "success": bool,
                "data": dict,  # 成功时的响应数据
                "error": dict,  # 失败时的错误信息
                "status_code": int,
            }
        """
        url = urljoin(self.config.api_base_url, endpoint)
        
        # 合并请求头
        request_headers = self._get_auth_headers()
        if headers:
            request_headers.update(headers)
        
        last_error = None
        for attempt in range(retry_count + 1):
            try:
                response = self.session.request(
                    method=method.upper(),
                    url=url,
                    params=params,
                    json=data,
                    headers=request_headers,
                    timeout=30,
                )
                
                # 成功响应
                if 200 <= response.status_code < 300:
                    return {
                        "success": True,
                        "data": response.json() if response.text else {},
                        "status_code": response.status_code,
                    }
                
                # 401 未授权 - 尝试刷新 Token
                if response.status_code == 401 and attempt < retry_count:
                    self.log(f"⚠️ Token expired, refreshing...", level="warning")
                    refresh_result = self.oauth.refresh_access_token()
                    if refresh_result.get("success"):
                        request_headers = self._get_auth_headers()
                        continue
                
                # 429 频率限制 - 等待后重试
                if response.status_code == 429 and attempt < retry_count:
                    import time
                    wait_time = int(response.headers.get("Retry-After", 5))
                    self.log(f"⚠️ Rate limited, waiting {wait_time}s...", level="warning")
                    time.sleep(wait_time)
                    continue
                
                # 其他错误
                error_data = response.json() if response.text else {"message": "Unknown error"}
                return {
                    "success": False,
                    "error": error_data,
                    "status_code": response.status_code,
                }
            
            except requests.RequestException as e:
                last_error = str(e)
                if attempt < retry_count:
                    self.log(f"⚠️ Request failed (attempt {attempt + 1}): {e}", level="warning")
                    continue
        
        return {
            "success": False,
            "error": {"message": f"Request failed after {retry_count + 1} attempts: {last_error}"},
            "status_code": 0,
        }
    
    def get(self, endpoint: str, params: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """GET 请求"""
        return self.request("GET", endpoint, params=params, **kwargs)
    
    def post(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """POST 请求"""
        return self.request("POST", endpoint, data=data, **kwargs)
    
    def put(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> Dict[str, Any]:
        """PUT 请求"""
        return self.request("PUT", endpoint, data=data, **kwargs)
    
    def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """DELETE 请求"""
        return self.request("DELETE", endpoint, **kwargs)
    
    def get_paginated(
        self,
        endpoint: str,
        params: Optional[Dict] = None,
        limit: int = 200,
        max_items: Optional[int] = None,
    ) -> List[Dict]:
        """
        获取分页数据 (自动处理分页)
        
        Args:
            endpoint: API 端点
            params: 查询参数
            limit: 每页数量 (默认 200，eBay 最大支持)
            max_items: 最大获取数量 (可选)
            
        Returns:
            所有结果的列表
        """
        all_items = []
        offset = 0
        params = params or {}
        
        while True:
            params["limit"] = limit
            params["offset"] = offset
            
            result = self.get(endpoint, params=params)
            
            if not result["success"]:
                self.log(f"❌ Pagination failed at offset {offset}: {result.get('error')}", level="error")
                break
            
            data = result["data"]
            
            # 根据 eBay API 响应结构提取项目
            # Fulfillment API: {"orders": [...], "total": N}
            # Finances API: {"transactions": [...], "total": N}
            items = (
                data.get("orders") or 
                data.get("transactions") or 
                data.get("payouts") or
                data.get("items") or
                []
            )
            
            if not items:
                break
            
            all_items.extend(items)
            
            # 检查是否达到限制
            if max_items and len(all_items) >= max_items:
                all_items = all_items[:max_items]
                break
            
            # 检查是否还有更多
            total = data.get("total", 0)
            if offset + len(items) >= total:
                break
            
            offset += limit
            self.log(f"📄 Fetched {len(all_items)}/{total} items...")
        
        self.log(f"✅ Pagination complete: {len(all_items)} items fetched")
        return all_items
