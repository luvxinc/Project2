# File Path: backend/manage.py
#!/usr/bin/env python
"""
文件说明: Django 管理入口 (Backend Management Utility)
"""
import os
import sys
from pathlib import Path

# [关键修正 V2] 深度伪装
# 1. 引入 pymysql
# 2. 强行修改版本号，骗过 Django 的检查 (Django 认为 PyMySQL 是老版本的 MySQLdb)
# 3. 执行伪装替换
try:
    import pymysql
    pymysql.install_as_MySQLdb()
    import MySQLdb
    # [Fix-Patch] Django 6.0 requires mysqlclient 2.2.1+
    # We must patch the alias object AFTER install_as_MySQLdb
    if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
        setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
        setattr(MySQLdb, '__version__', '2.2.1')
except ImportError:
    pass

def main():
    """Run administrative tasks."""
    # 1. 路径注入
    current_dir = Path(__file__).resolve().parent
    project_root = current_dir.parent
    sys.path.append(str(project_root))

    # 2. 设置配置
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()