# File Path: backend/erp_core/wsgi.py
"""
文件说明: WSGI 生产环境接口
"""
import os
import sys
from pathlib import Path

# [关键修正 V2] 深度伪装
try:
    import pymysql
    pymysql.install_as_MySQLdb()
    import MySQLdb
    # [Fix-Patch] Django 6.0
    if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
        setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
        setattr(MySQLdb, '__version__', '2.2.1')
except ImportError:
    pass

from django.core.wsgi import get_wsgi_application

# 1. 路径注入 Logic
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent
project_root = backend_dir.parent

if str(project_root) not in sys.path:
    sys.path.append(str(project_root))
if str(backend_dir) not in sys.path:
    sys.path.append(str(backend_dir))

# 2. 加载配置
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

application = get_wsgi_application()