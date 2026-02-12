# backend/scripts/verify_audit_click_to_detail.py
"""
验收脚本：三类日志页面 list row click -> detail page
验证项：
1. list 200
2. extract record_key
3. detail 200
4. return link exists
5. detail-card marker exists
"""
import os
import re
import sys
from urllib.parse import quote

from pathlib import Path

# Add paths like manage.py does
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_config.settings")

# PyMySQL disguise (same as manage.py)
try:
    import pymysql
    pymysql.install_as_MySQLdb()
    import MySQLdb
    if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
        setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
        setattr(MySQLdb, '__version__', '2.2.1')
except ImportError:
    pass

import django
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model


# ========= 你只允许改这里（BEGIN） =========
PAGES = [
    {
        "name": "业务操作日志",
        "list_url": "/dashboard/audit/business/?days=1",
        # 从列表 HTML 中提取 href 中的 key
        "extract_key": {
            "type": "regex",
            "pattern": r'/dashboard/audit/details/([^/]+)/\?return=',
        },
        "detail_prefix": "/dashboard/audit/details/",
    },
    {
        "name": "全景数据审计",
        "list_url": "/dashboard/audit/events/?days=1",
        "extract_key": {
            "type": "regex",
            "pattern": r'/dashboard/audit/events/([^/]+)/\?return=',
        },
        "detail_prefix": "/dashboard/audit/events/",
    },
    {
        "name": "系统故障监控",
        "list_url": "/dashboard/audit/system/?days=1",
        "extract_key": {
            "type": "regex",
            "pattern": r'/dashboard/audit/details/([^/]+)/\?return=',
        },
        "detail_prefix": "/dashboard/audit/details/",
    },
]
ADMIN_USERNAME = "admin"
# ========= 你只允许改这里（END） =========


def must(cond, msg):
    if not cond:
        raise AssertionError(msg)

def extract_first_key(html: str, rule: dict) -> str | None:
    t = rule.get("type")
    if t == "regex":
        m = re.search(rule["pattern"], html)
        return m.group(1) if m else None
    raise ValueError(f"Unknown extract_key type: {t}")

def main():
    User = get_user_model()
    user = User.objects.filter(username=ADMIN_USERNAME).first()
    must(user is not None, f"Admin user '{ADMIN_USERNAME}' not found")

    c = Client()
    c.force_login(user)

    print("=== VERIFY: audit list row click -> detail page ===")

    for page in PAGES:
        name = page["name"]
        list_url = page["list_url"]
        detail_prefix = page["detail_prefix"]

        print(f"\n[{name}]")
        # 1) list 200
        r = c.get(list_url)
        must(r.status_code == 200, f"{name}: list page not 200, got {r.status_code}")
        html = r.content.decode("utf-8", "ignore")
        print(f"  list: 200 OK ({list_url})")

        # 2) extract key
        key = extract_first_key(html, page["extract_key"])
        must(key, f"{name}: cannot extract record_key from list html. Fix extract_key rule or list template href/data attr.")
        print(f"  extracted key: {key}")

        # 3) detail 200 (with return)
        ret = quote(list_url, safe="")
        detail_url = f"{detail_prefix}{key}/?return={ret}"
        d = c.get(detail_url)
        must(d.status_code == 200, f"{name}: detail page not 200, got {d.status_code}. url={detail_url}")
        dhtml = d.content.decode("utf-8", "ignore")
        print(f"  detail: 200 OK ({detail_url})")

        # 4) must have return link
        must("return=" in dhtml, f"{name}: detail page missing return= link")
        must("返回列表" in dhtml or "Return" in dhtml, f"{name}: detail page missing '返回列表' button text")

        # 5) must have a deterministic marker for the 'business card' layout
        must('data-testid="detail-card"' in dhtml, f'{name}: detail page missing data-testid="detail-card" marker for card layout')
        print("  assertions: PASS (return link + detail-card)")

    print("\nALL PASS ✅")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("\nFAIL ❌", str(e))
        sys.exit(1)
