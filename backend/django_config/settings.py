# File Path: backend/erp_core/settings.py
"""
文件说明: Django 核心配置 (Core Settings) - V2.0.0 UI Phase 1
修改记录:
1. [Add] 注册 'web_ui' 应用。
2. [Mod] 配置 TEMPLATES 和 STATICFILES_DIRS 以支持自定义前端。
3. [Keep] 保持数据库和安全配置从 config.settings 读取 (SSOT)。
"""

import os
import sys
from pathlib import Path

# -----------------------------------------------------------------------------
# 1. 路径与环境融合
# -----------------------------------------------------------------------------
# BASE_DIR 指向 backend 目录 (erp_core 的上一级)
BASE_DIR = Path(__file__).resolve().parent.parent

# [Fix] 将 backend 目录本身加入系统路径，确保可以直接 import apps
sys.path.append(str(BASE_DIR))

try:
    # 尝试从项目根目录加载共享配置 (backend/common/settings.py)
    from backend.common.settings import settings as app_settings
except ImportError:
    # 如果失败，回退一级寻找 (适配不同的运行环境)
    project_root = BASE_DIR.parent
    sys.path.append(str(project_root))
    from backend.common.settings import settings as app_settings

# -----------------------------------------------------------------------------
# 2. 安全与核心
# -----------------------------------------------------------------------------
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-eaglestar-hybrid-core-dev-key')
DEBUG = True  # 开发阶段强制开启调试模式，以便看到详细报错
ALLOWED_HOSTS = ['*']

# [Fix] 添加公网域名到 CSRF 信任列表，解决 Cloudflare Tunnel 访问时的 403 错误
CSRF_TRUSTED_ORIGINS = [
    'https://erp.topmorrowusa.com',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
]

# -----------------------------------------------------------------------------
# 3. 应用注册 (Installed Apps)
# -----------------------------------------------------------------------------
INSTALLED_APPS = [
    # --- Django Native ---
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # --- Third Party ---
    'rest_framework',
    'corsheaders',

    # --- Eaglestar Core ---
    # --- Eaglestar Core ---
    'backend.legacy_bridge',  # 遗留数据桥接
    'backend.web_ui',  # [New] 全新 UI 界面层 (Phase 1)
    'backend.apps.sys_config',  # 系统配置中心
    'backend.apps.purchase',   # [New] 采购板块
    # 'backend.apps.inventory',  # 库存业务 [DISABLED - Not Implemented]
    'backend.apps.locking',  # 分布式锁
    'backend.apps.audit',  # 审计日志
    'apps.log',             # [New] 企业级日志系统
    # 'backend.apps.etl',  # 数据集成 [DISABLED due to serious issues]
    'backend.apps.reports',  # 报表中心
    'backend.apps.visuals',
    'backend.apps.user_admin',  # 用户管理
    'backend.apps.db_admin',  # 数据库运维
    'backend.apps.ebay',  # [New] eBay API 集成 (独立于 ETL)

]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',  # [New] 国际化语言切换

    # [New V2.0] 企业级日志系统 - 访问日志
    'core.middleware.access.AccessLogMiddleware',
    
    # [New V2.0] 企业级日志系统 - 全局异常捕获 (必须靠前)
    'core.middleware.exception.GlobalExceptionMiddleware',

    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',

    # 全局业务审计 (旧系统，保持兼容)
    'core.middleware.audit_middleware.AuditOperationMiddleware',

    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',

    # 安全网关
    'middleware.security_gate.SecurityGateMiddleware',
]


ROOT_URLCONF = 'django_config.urls'

# -----------------------------------------------------------------------------
# 4. 模板配置 (Templates)
# -----------------------------------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',

                # [New] 注册我们的侧边栏处理器
                'web_ui.context_processors.global_sidebar_context',
            ],
        },
    },
]

WSGI_APPLICATION = 'django_config.wsgi.application'

# -----------------------------------------------------------------------------
# 5. 数据库配置 (SSOT - Single Source of Truth)
# -----------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': app_settings.DB_NAME,
        'USER': app_settings.DB_USER,
        'PASSWORD': app_settings.DB_PASS,
        'HOST': app_settings.DB_HOST,
        'PORT': app_settings.DB_PORT,
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES', collation_connection='utf8mb4_unicode_ci'",
        },
    }
}

# -----------------------------------------------------------------------------
# 6. 国际化与时区
# -----------------------------------------------------------------------------
from django.utils.translation import gettext_lazy as _

LANGUAGE_CODE = 'zh-hans'
TIME_ZONE = 'America/Los_Angeles'  # 保持洛杉矶时间
USE_I18N = True
USE_TZ = False  # 保持 False 以兼容旧系统时间处理

# [New] 支持的语言列表
LANGUAGES = [
    ('zh-hans', _('简体中文')),
    ('en', _('English')),
]

# [New] 翻译文件目录
LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# -----------------------------------------------------------------------------
# [New] Session & Security Config
# -----------------------------------------------------------------------------
LOGIN_URL = '/login/'  # [Fix] 显式指定登录页 URL，防止跳转到默认的 /accounts/login/
LOGIN_REDIRECT_URL = '/dashboard/'
LOGOUT_REDIRECT_URL = '/login/'

# 1. 关闭浏览器/标签页时，Session Cookie 立即失效
SESSION_EXPIRE_AT_BROWSER_CLOSE = True

# 2. 每次请求都更新 Session 数据 (保证 Last Active 时间刷新)
SESSION_SAVE_EVERY_REQUEST = True

# 3. 闲置超时秒数 (从 config 读取)
AUTO_LOGOUT_SECONDS = app_settings.AUTO_LOGOUT_SECONDS

# -----------------------------------------------------------------------------
# 7. 静态文件 (Static Files)
# -----------------------------------------------------------------------------
STATIC_URL = 'static/'
# [New] 指向 backend/static 目录 (存放我们下载的 css/js)
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]
STATIC_ROOT = BASE_DIR / 'static_collect'

# -----------------------------------------------------------------------------
# 8. DRF API 配置
# -----------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ]
}

CORS_ALLOW_ALL_ORIGINS = True

# =============================================================================
# 9. 认证后端 (Authentication Backends)
# =============================================================================
AUTHENTICATION_BACKENDS = [
    'backend.legacy_bridge.auth_backend.LegacyAuthBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# =============================================================================
# 10. 企业级日志系统配置 (Log System V2.0)
# =============================================================================
# 开发模式：True = 日志标记为开发日志，发布前可一键清理
LOG_DEV_MODE = os.environ.get('LOG_DEV_MODE', 'true').lower() == 'true'
