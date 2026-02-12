# Agent 配置中心

> **四层架构: L1 工程部 + L2 入口 + L3 工具库 + L4 客户项目**
> **运作方式: 一个完整的 IT 大厂**

---

## 公司组织架构

```
╔═══════════════════════════════════════════════════════╗
║                    用户 (客户)                         ║
╚═══════════════════════╤═══════════════════════════════╝
                        │ 唯一对话通道
┏━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  L2: 用户入口 (Slash Commands)                        ┃
┃                                                       ┃
┃  /contact — PM 接管, 启动全链路                         ┃
┃  /main_build, /main_guard, /main_ship, /main_ui       ┃
┃  → 路由到 L1 对应 Workflow                             ┃
┃                                                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                        │ 路由
┏━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  L1: 工程部 (泛化, 跨项目通用)                         ┃
┃                                                       ┃
┃  📋 PM — 需求领悟/翻译/分诊/督导/交付                   ┃
┃  🏛️ CTO — 任务分析/分配/协调/整合验证                   ┃
┃  🔍 QA  — 最终审计/错误归档/SOP更新/培训                ┃
┃  🔄 协作 — 跨团队交接/依赖/讨论协议                     ┃
┃  👨‍💻 工程师 — 后端/前端/数据/消息/集成/安全/基建/可观测/性能/平台 ┃
┃  📂 core/ — 17 个 Skills + 4 个 Workflows              ┃
┃                                                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                        │ 调用
┏━━━━━━━━━━━━━━━━━┳━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ L3: 工具库       ┃  L4: 客户项目资料                    ┃
┃ (泛化, 跨项目)   ┃  (项目特定, 可归档/替换)             ┃
┃                  ┃                                     ┃
┃ 📦 warehouse/    ┃  📂 projects/{project}/              ┃
┃    tools/        ┃     CONTEXT.md  — 项目入口            ┃
┃    (SDK 参考)    ┃     roadmap.md  — 进度规划            ┃
┃                  ┃     recipes/    — 烹饪指南            ┃
┃                  ┃     reference/  — 技术参考资料        ┃
┃                  ┃     data/       — 过程数据            ┃
┃                  ┃       audits/ specs/ progress/        ┃
┃                  ┃       plans/ checkpoints/ errors/     ┃
┃                  ┃                                     ┃
┗━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

---

## 文件结构

```
.agent/
├── README.md                           ← 你在这里
│
├── core/                               # ━━ L1: 工程部 (泛化) ━━
│   ├── SKILL.md                        # 组织架构图 + 路由索引
│   ├── skills/
│   │   ├── project-manager.md          # 📋 PM SOP
│   │   ├── chief-engineer.md           # 🏛️ CTO SOP
│   │   ├── qa-auditor.md               # 🔍 QA SOP
│   │   ├── collaboration.md            # 🔄 协作 SOP
│   │   ├── requirements.md             # 需求向导 Wizard
│   │   ├── handoff.md                  # 会话交接协议
│   │   ├── backend.md                  # 👨‍💻 后端架构师
│   │   ├── frontend.md                 # 👨‍💻 前端架构师
│   │   ├── data.md                     # 👨‍💻 数据架构师
│   │   ├── security.md                 # 👨‍💻 安全架构师
│   │   ├── infrastructure.md           # 👨‍💻 基建架构师
│   │   ├── messaging.md                # 👨‍💻 消息架构师
│   │   ├── integration.md              # 👨‍💻 集成架构师
│   │   ├── observability.md            # 👨‍💻 可观测架构师
│   │   ├── performance.md              # 👨‍💻 性能工程师
│   │   ├── platform.md                 # 👨‍💻 平台工程师
│   │   └── agent-mastery.md            # 🤖 Agent 行为优化
│   └── workflows/
│       ├── build.md                    # /main_build (含 §0 Wizard)
│       ├── ship.md                     # /main_ship
│       ├── guard.md                    # /main_guard
│       └── ui.md                       # /main_ui
│
├── workflows/                          # ━━ L2: 用户入口 ━━
│   ├── contact.md                      # /contact → PM
│   ├── main_build.md → core/workflows/build.md
│   ├── main_guard.md → core/workflows/guard.md
│   ├── main_ship.md  → core/workflows/ship.md
│   └── main_ui.md    → core/workflows/ui.md
│
├── warehouse/                          # ━━ L3: 工具库 (泛化) ━━
│   ├── README.md                       # 使用说明
│   └── tools/                          # SDK/库参考
│       └── animejs.md                  # Anime.js 4.0 参考
│
└── projects/                           # ━━ L4: 客户项目 ━━
    └── mgmt/                           # MGMT ERP 项目
        ├── CONTEXT.md                  # 项目入口 (PM 第一个读)
        ├── roadmap.md                  # 进度规划
        ├── recipes/                    # 烹饪指南 (组合 L1 技能)
        │   ├── vma.md
        │   ├── migration.md
        │   └── security.md
        ├── reference/                  # 项目技术参考资料
        │   ├── iron-laws.md            # 🔴 铁律 + 生产凭据
        │   ├── v2-architecture.md      # V2 NestJS 架构规范
        │   ├── v3-architecture.md      # V3 Kotlin 架构全景
        │   ├── v1-deep-dive.md         # V1 MySQL 全景分析
        │   ├── migration.md            # 迁移五阶段路线
        │   ├── migration-v1.md         # V1 迁移工作流
        │   ├── migration-v2.md         # V2→V3 迁移工作流
        │   ├── business-rules.md       # 业务规则
        │   ├── conventions.md          # 项目约定
        │   ├── kafka-design.md         # Kafka 设计
        │   └── search-analytics.md     # 搜索/报表设计
        └── data/                       # 过程数据
            ├── audits/                 # 审计报告
            ├── specs/                  # 需求文档
            ├── progress/               # 进度追踪
            ├── plans/                  # 任务分配
            ├── checkpoints/            # 会话检查点
            ├── errors/                 # 错误归档
            └── training/               # 培训记录
```

---

## 四层分工

| 层级 | 目录 | 性质 | 内容 |
|------|------|------|------|
| **L1** | `core/` | 泛化 (跨项目) | 17 Skills + 4 Workflows — 公司技术组织架构 |
| **L2** | `workflows/` | 泛化 (入口) | Slash commands — 路由到 L1 |
| **L3** | `warehouse/` | 泛化 (跨项目) | 通用工具/SDK 参考 |
| **L4** | `projects/` | 项目特定 | 客户资料 — 可归档后添加新项目 |

> **L1 + L2 + L3 = 公司基础设施, 永不变**
> **L4 = 客户项目, 清空/归档后可接新项目**

---

## 任务流程闭环

```
1. 用户 → PM: 提出需求
2. PM: 领悟 → 翻译 → 分诊 → 写需求文档 → 存 L4 data/specs/
3. PM → CTO: 交需求文档
4. CTO: 分析 → 分解 → 写任务分配单 → 存 L4 data/plans/ → 分配给工程师
5. 工程师: 按 L1 SOP 执行 → 内部讨论 → 交给 CTO
6. CTO: 整合验证 → ✅ 交 QA / ❌ 退回工程师
7. QA: 审计 → 写报告存 L4 data/audits/ → ✅ 交 PM / ❌ 退回
8. QA: 记录错误 → 存 L4 data/errors/ → 更新 SOP → 培训
9. PM: 检查交付 → 交给用户确认
10. 用户: ✅ 确认完成 / ❌ PM 重启循环
```

---

## Slash Commands

| 命令 | 功能 |
|------|------|
| `/contact` | **售前** — 联系 PM, 启动全链路 |
| `/main_build` | 造 — 新建/重构 (含 §0 需求向导) |
| `/main_ship` | 发 — 本地开发/CI-CD/部署 |
| `/main_guard` | 守 — TDD/审查/安全/排查 |
| `/main_ui` | 界面 — Hub 页面/主题/动画 |
