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
┃  → thin redirect → L1 真相源 Workflow                  ┃
┃                                                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                        │ 路由
┏━━━━━━━━━━━━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  L1: 工程部 (泛化, 跨项目通用)                         ┃
┃                                                       ┃
┃  📋 PM — 需求领悟/翻译/分诊/督导/交付                   ┃
┃  🏛️ CTO — 任务分析/分配/协调/整合验证                   ┃
┃  🔍 QA  — 最终审计/错误归档/SOP 更新/培训               ┃
┃  🧠 记忆 — 追踪器/验收保护/错题本/规划/上下文           ┃
┃  🔄 协作 — 跨团队交接/依赖/讨论协议                     ┃
┃                                                       ┃
┃  ┌─────────────┬──────────────┬──────────────┐        ┃
┃  │ 📱 产品工程部  │ ⚙️ 服务工程部  │ 🛠️ 平台工程部  │        ┃
┃  │  前端架构师   │  后端架构师   │  基建架构师   │        ┃
┃  │  (按需加载)   │  数据架构师   │  可观测架构师  │        ┃
┃  │             │  安全架构师   │  性能工程师   │        ┃
┃  │             │  集成工程师   │  平台工程师   │        ┃
┃  │             │  消息工程师   │             │        ┃
┃  └─────────────┴──────────────┴──────────────┘        ┃
┃                                                       ┃
┃  📂 core/ — 20 Skills + 3 Rules + 4 Workflows          ┃
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
┃                  ┃     playbooks/  — 项目实施方案         ┃
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
.claude/
├── README.md                           ← 你在这里
│
├── core/                               # ━━ L1: 工程部 (泛化) ━━
│   ├── SKILL.md                        # 组织架构图 + 路由索引
│   ├── skills/
│   │   ├── project-manager.md          # 📋 PM SOP
│   │   ├── chief-engineer.md           # 🏛️ CTO SOP
│   │   ├── qa-auditor.md               # 🔍 QA SOP
│   │   ├── memory.md                   # 🧠 记忆管理 SOP
│   │   ├── collaboration.md            # 🔄 协作 SOP
│   │   ├── requirements.md             # 需求向导 Wizard
│   │   ├── handoff.md                  # 会话交接协议
│   │   ├── agent-mastery.md            # 🤖 Agent 行为优化
│   │   │
│   │   ├── domains/                    # 📂 部门域索引 (二级路由)
│   │   │   ├── product.md              # 📱 产品工程部索引
│   │   │   ├── service.md              # ⚙️ 服务工程部索引
│   │   │   └── platform.md             # 🛠️ 平台工程部索引
│   │   │
│   │   ├── frontend.md                 # 📱 前端架构师
│   │   ├── backend.md                  # ⚙️ 后端架构师
│   │   ├── data.md                     # ⚙️ 数据架构师
│   │   ├── security.md                 # ⚙️ 安全架构师
│   │   ├── integration.md              # ⚙️ 集成工程师
│   │   ├── messaging.md                # ⚙️ 消息工程师
│   │   ├── infrastructure.md           # 🛠️ 基建架构师
│   │   ├── observability.md            # 🛠️ 可观测架构师
│   │   ├── performance.md              # 🛠️ 性能工程师
│   │   └── platform.md                 # 🛠️ 平台工程师
│   │
│   └── workflows/                      # 核心工作流 (真相源)
│       ├── build.md                    # 造 — 新建/重构 (含 §0 状态机)
│       ├── ship.md                     # 发 — 本地开发/CI-CD/部署
│       ├── guard.md                    # 守 — TDD/审查/安全/排查
│       └── ui.md                       # 界面 — Hub 页面/主题/动画
│
│   ├── rules/                          # 🔴 强制规则层 (违反即驳回)
│   │   ├── common.md                  # 8 章: 代码风格/Git/测试/安全/验证循环
│   │   ├── frontend.md                # 前端自检: 10 反模式 (F1-F10) + Checklist
│   │   └── backend.md                 # 后端自检: 10 反模式 (B1-B10) + Checklist
│
├── workflows/                          # ━━ L2: 用户入口 ━━
│   ├── contact.md                      # /contact → PM 接管
│   ├── main_build.md                   # → redirect core/workflows/build.md
│   ├── main_guard.md                   # → redirect core/workflows/guard.md
│   ├── main_ship.md                    # → redirect core/workflows/ship.md
│   └── main_ui.md                      # → redirect core/workflows/ui.md
│
├── warehouse/                          # ━━ L3: 工具库 (泛化) ━━
│   ├── README.md                       # 使用说明
│   └── tools/                          # SDK/库参考 (按 INDEX.md 索引)
│
└── projects/                           # ━━ L4: 客户项目 ━━
    └── mgmt/                           # MGMT ERP 项目
        ├── CONTEXT.md                  # 项目入口 (PM 第一个读)
        ├── roadmap.md                  # 进度规划
        ├── playbooks/                  # 项目实施方案 (组合 L1 通用 SOP)
        │   ├── vma.md                  # VMA 模块实施方案
        │   ├── migration.md            # V2→V3 迁移实施方案
        │   └── security.md             # 安全等级实施方案
        ├── reference/                  # 项目技术参考资料
        │   ├── iron-laws.md            # 🔴 铁律 + 生产凭据
        │   ├── v3-architecture.md      # V3 Kotlin 架构全景
        │   ├── migration.md            # 迁移路线图 (含 V1/V2 附录)
        │   └── ...                     # 更多参考文档
        └── data/                       # 过程数据
            ├── audits/                 # 审计报告 (永久保留)
            ├── specs/                  # 需求文档
            ├── progress/               # 进度追踪 (含 TRACKER + ACCEPTED.md)
            ├── plans/                  # 任务分配
            ├── checkpoints/            # 会话检查点 (验收后删除)
            ├── errors/                 # 错题本 (永久学习)
            └── training/               # 培训记录
```

---

## 四层分工

| 层级 | 目录 | 性质 | 内容 |
|------|------|------|------|
| **L1** | `core/` | 泛化 (跨项目) | 20 Skills + 4 Workflows — 公司技术组织架构 |
| **L2** | `workflows/` | 泛化 (入口) | Slash commands → thin redirect → L1 真相源 |
| **L3** | `warehouse/` | 泛化 (跨项目) | 通用工具/SDK 参考 |
| **L4** | `projects/` | 项目特定 | 客户资料 — 可归档后添加新项目 |

> **L1 + L2 + L3 = 公司基础设施, 永不变**
> **L4 = 客户项目, 清空/归档后可接新项目**

---

## 三级检索架构

> **每次任务只加载需要的内容, 不全量扫描。**

```
层1: SKILL.md 域路由      → 3 行描述 → 选中 1 个域
层2: domains/*.md 域索引   → 关键词 → 定位工程师 SOP §N
层3: skills/*.md §N 切片   → 50-100 行具体执行标准

总容量: 3600+ 行工程师 SOP + 350 行域索引
单次任务加载: ~150 行 (索引 + 切片) = 总量的 ~4%
```

---

## 记忆管理

> **每个任务从开始到验收, 都有全流程记忆跟随。**

```
任务开始 → 创建 TRACKER (progress/)
全程更新进度日志
验收 ✅ →
  产出写入 ACCEPTED.md (保护已验收内容)
  错误写入 ERROR-BOOK.md (永久学习, 关键词触发)
  TRACKER 删除 ✅ (释放)
  Checkpoint 删除 ✅ (释放)
  审计报告保留 (永久)
```

详见 `skills/memory.md`

---

## 任务流程闭环

```
1. 用户 → PM: 提出需求
2. PM: 领悟 → 翻译 → 写 Spec → 创建 TRACKER → 存 L4 data/specs/
3. PM → CTO: 交需求文档 + 域预分类
4. CTO: 加载域索引 → 定位工程师 → 分解 → 写任务分配单 → 存 L4 data/plans/
5. 工程师: 查错题本 → 按 L1 SOP 执行 → 更新 TRACKER → 完工报告 → 交 CTO
6. CTO: 整合验证 → ✅ 交 QA / ❌ 退回 (写错题本)
7. QA: 审计 → 写报告 → 存 L4 data/audits/ → ✅ 交 PM / ❌ 退回 (写错题本)
8. PM: 检查交付 → 交给用户确认
9. 用户: ✅ 验收 → 执行验收后协议 (ACCEPTED + 清理 TRACKER)
         ❌ 退回 → PM 重启循环
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
