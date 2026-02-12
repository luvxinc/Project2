#!/usr/bin/env python3
"""
验证所有 action_registry.json 中的 action 都能被 SecurityPolicyManager 正确加载
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, backend_dir)
sys.path.insert(0, project_root)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

# PyMySQL 伪装
import pymysql
pymysql.install_as_MySQLdb()
import MySQLdb
if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
    setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
    setattr(MySQLdb, '__version__', '2.2.1')

import django
django.setup()

from backend.common.settings import settings
from core.services.security.policy_manager import SecurityPolicyManager

def verify_action_loading():
    """验证所有 action 都能被加载"""
    print("=" * 70)
    print("Security Action Loading Verification")
    print("=" * 70)
    
    # 获取 action_registry.json 中的所有 action keys
    registry = settings.load_action_registry()
    expected_keys = set()
    
    for mod in registry.get("modules", []):
        # 直接 tabs
        for tab in mod.get("tabs", []):
            for act in tab.get("actions", []):
                if act.get("key"):
                    expected_keys.add(act["key"])
        
        # submodules → tabs
        for sub in mod.get("submodules", []):
            for tab in sub.get("tabs", []):
                for act in tab.get("actions", []):
                    if act.get("key"):
                        expected_keys.add(act["key"])
    
    print(f"\n[Registry] Total expected actions: {len(expected_keys)}")
    
    # 强制重载缓存
    SecurityPolicyManager.reset_cache()
    
    # 获取缓存中的 keys
    loaded_keys = set(SecurityPolicyManager._registry_cache.keys())
    print(f"[Cache] Total loaded actions: {len(loaded_keys)}")
    
    # 检查差异
    missing = expected_keys - loaded_keys
    extra = loaded_keys - expected_keys
    
    if missing:
        print(f"\n❌ MISSING actions (not loaded):")
        for key in sorted(missing):
            print(f"   - {key}")
    
    if extra:
        print(f"\n⚠️  EXTRA actions (in cache but not in registry):")
        for key in sorted(extra):
            print(f"   - {key}")
    
    if not missing and not extra:
        print("\n✅ ALL ACTIONS CORRECTLY LOADED")
        return True
    
    return False

if __name__ == '__main__':
    success = verify_action_loading()
    sys.exit(0 if success else 1)
