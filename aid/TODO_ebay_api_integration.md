# eBay API 集成待办事项

> 创建日期: 2026-01-15
> 更新日期: 2026-01-16
> 状态: 🚧 开发中 - 基础架构已完成

---

## 📋 任务目标

将当前的 Sales ETL (Excel 上传) 升级为 eBay API 自动获取交易数据

**重要**: eBay API 模块完全独立于现有 ETL 模块
- **ETL** (`core/services/etl/`) → 仅用于 CSV 手动上传/备份
- **eBay** (`core/services/ebay/`) → 全新的 API 自动同步模块

---

## ✅ 准备工作清单

### 用户侧 (Aaron)
- [x] 注册 eBay Developer Account
- [x] 等待账户审核通过 ✅ 2026-01-16
- [x] 创建 Sandbox App Keys
- [x] 配置 RuName

### 凭证信息
```
Environment: Sandbox
App ID:  (see .env → EBAY_SANDBOX_APP_ID)
Cert ID: (see .env → EBAY_SANDBOX_CERT_ID)
Dev ID:  (see .env → EBAY_DEV_ID)
RuName:  (see .env → EBAY_SANDBOX_RU_NAME)
```

### 开发侧 (Agent)
- [x] 创建 `backend/core/services/ebay/` 模块
  - [x] `config.py` - 配置管理
  - [x] `oauth.py` - OAuth 2.0 认证
  - [x] `client.py` - API 通用客户端
  - [x] `fulfillment.py` - 订单 API
  - [x] `finances.py` - 财务 API
  - [x] `sync.py` - 数据同步服务
- [x] 创建 `backend/apps/ebay/` Django 应用
  - [x] `views.py` - Web 视图
  - [x] `api.py` - REST API
  - [x] `urls.py` - 路由配置
- [x] 创建前端模板
  - [x] `ebay/dashboard.html` - 集成仪表板
  - [x] `ebay/sync.html` - 同步页面
- [x] 注册到 Django settings 和 urls
- [ ] 实现数据库存储逻辑
- [ ] 实现 Token 持久化存储
- [ ] Sandbox 测试
- [ ] Production 部署

---

## 🔧 已完成的技术架构

### 模块结构
```
backend/
├── core/services/ebay/        # 核心服务层 (独立于 ETL)
│   ├── __init__.py
│   ├── config.py              # 配置管理 (环境变量/数据库)
│   ├── oauth.py               # OAuth 2.0 认证管理
│   ├── client.py              # API 通用客户端 (重试/分页)
│   ├── fulfillment.py         # Fulfillment API (订单)
│   ├── finances.py            # Finances API (财务)
│   └── sync.py                # 数据同步调度器
│
├── apps/ebay/                 # Django 应用层
│   ├── __init__.py
│   ├── apps.py
│   ├── urls.py                # 路由配置
│   ├── views.py               # Web 视图 (授权/仪表板)
│   └── api.py                 # REST API
│
└── templates/ebay/            # 前端模板
    ├── dashboard.html         # 集成仪表板
    └── sync.html              # 同步管理页面
```

### API 映射
| eBay API | 用途 | 替代的 CSV |
|----------|------|------------|
| Fulfillment API | 订单管理 | Transaction Report |
| Finances API | 财务数据 | Order Earnings Report |

### 可用端点
| 端点 | 方法 | 描述 |
|------|------|------|
| `/ebay/` | GET | 集成仪表板 |
| `/ebay/authorize/` | GET | 开始 OAuth 授权 |
| `/ebay/callback/` | GET | OAuth 回调 |
| `/ebay/sync/` | GET | 同步管理页面 |
| `/ebay/api/status/` | GET | 获取状态 |
| `/ebay/api/sync/orders/` | POST | 同步订单 |
| `/ebay/api/sync/finances/` | POST | 同步财务 |
| `/ebay/api/sync/all/` | POST | 完整同步 |

---

## ⏳ 下一步任务

### 1. Token 持久化存储
- [ ] 创建数据库表 `ebay_credentials`
- [ ] 加密存储 Access Token 和 Refresh Token
- [ ] 支持多账户

### 2. 数据库写入
- [ ] 对接 `Data_Transaction` 表写入
- [ ] 对接 `Data_Order_Earning` 表写入
- [ ] 实现去重和更新逻辑

### 3. Sandbox 测试
- [ ] 使用 eBay 测试账户进行授权
- [ ] 验证订单数据拉取
- [ ] 验证财务数据拉取

### 4. UI 完善
- [ ] 添加到侧边栏导航
- [ ] i18n 国际化支持

---

## ❓ 待确认问题

1. **多账户支持**: 有多少个 eBay 卖家账户需要集成？
2. **数据频率**: 需要多久同步一次？(每小时/每天/手动触发)
3. **历史数据**: 需要拉取多久之前的历史数据？(最多2年订单/5年财务)

---

## 📚 参考资料

- eBay Developer Portal: https://developer.ebay.com
- Fulfillment API 文档: https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
- Finances API 文档: https://developer.ebay.com/api-docs/sell/finances/overview.html
- OAuth 2.0 指南: https://developer.ebay.com/api-docs/static/oauth-scopes.html
