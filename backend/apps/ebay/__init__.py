# File: backend/apps/ebay/__init__.py
"""
# ==============================================================================
# 模块名称: eBay 集成应用 (eBay Integration App)
# ==============================================================================
#
# [Purpose / 用途]
# Django 应用：提供 eBay API 集成的 Web 界面和 REST API。
# 独立于 ETL 模块，ETL 仅保留用于 CSV 备份/手动上传。
#
# [Architecture / 架构]
# - Views: OAuth 授权流程、数据同步触发
# - APIs: RESTful 接口供前端调用
# - Templates: 授权页面、同步状态页面
#
# ==============================================================================
"""

default_app_config = 'backend.apps.ebay.apps.EbayConfig'
