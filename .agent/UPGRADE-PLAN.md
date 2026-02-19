# Agent System 升级与优化计划 v1.0

> **基于**: `AUDIT-REPORT.md` 审计发现
> **创建日期**: 2026-02-19
> **目标**: 指令量减半、增加快速通道、消除矛盾、落地记忆系统、为 Antigravity 迁移做准备

---

## 执行总览

```
Phase 0: 紧急修复 (Bug Fix)                    ⏱ 0.5 天   难度: ★☆☆☆☆
Phase 1: 指令瘦身 (Token Compression)           ⏱ 2-3 天   难度: ★★★☆☆
Phase 2: 架构优化 (Express Path + 角色简化)      ⏱ 1-2 天   难度: ★★★☆☆
Phase 3: 去重与合并 (DRY Consolidation)          ⏱ 1-2 天   难度: ★★☆☆☆
Phase 4: 记忆系统落地 (Memory Grounding)         ⏱ 1 天     难度: ★★☆☆☆
Phase 5: Antigravity 适配准备 (Migration Prep)   ⏱ 2-3 天   难度: ★★★★☆
Phase 6: Antigravity 迁移执行 (Migration Exec)   ⏱ 3-5 天   难度: ★★★★★

Phase 0-4 总计: ~6-8 天 (Claude Code 优化, 必做)
Phase 5-6 总计: ~5-8 天 (Antigravity 迁移, 可选)
```

### 预期最终效果

| 指标 | 当前 | Phase 0 后 | Phase 1-2 后 | Phase 3-4 后 | Phase 5-6 后 |
|------|------|-----------|-------------|-------------|-------------|
| 总指令行数 | ~8,150 | ~8,100 (−0.5%) | ~4,900 (−40%) | ~4,200 (−48%) | N/A (Skills) |
| 典型任务 token | ~12,680 | ~12,400 (−2%) | ~6,800 (−46%) | ~5,500 (−57%) | ~3,000 (−76%) |
| 简单任务效率 | 基线 | +10% | **+50%** | +55% | +80% |
| 复杂任务准确度 | 基线 | +10% | +20% | **+25%** | +35% |
| 自审查有效性 | 低 | 低 | 低 | 低 | **+30%** (Multi-Agent) |

---

## Phase 0: 紧急修复 — 零成本高收益

> **预计耗时: 0.5 天 | 难度: ★☆☆☆☆ | 优先级: 立即执行**

### 0.1 修复双层路径错误

**问题:** 多个文件中 `.agent/.agent/projects/` 双层路径导致文件操作失败。

**修复清单:**

| # | 文件 | 行号 | 修改 |
|---|------|------|------|
| 1 | `core/skills/chief-engineer.md` | L203 | `.agent/.agent/projects/` → `.agent/projects/` |
| 2 | `core/skills/project-manager.md` | L243 | `.agent/.agent/projects/` → `.agent/projects/` |
| 3 | `core/skills/project-manager.md` | L276 | `.agent/.agent/projects/` → `.agent/projects/` |
| 4 | `core/skills/project-manager.md` | L308 | `.agent/.agent/projects/` → `.agent/projects/` |
| 5 | `core/skills/qa-auditor.md` | L366 | `.agent/.agent/projects/` → `.agent/projects/` |
| 6 | `core/skills/qa-auditor.md` | L376 | `.agent/.agent/projects/` → `.agent/projects/` |
| 7 | `core/skills/requirements.md` | L155 | `.agent/.agent/projects/` → `.agent/projects/` |
| 8 | `core/skills/memory.md` | 全文扫描 | 统一路径格式 |

**验证:** `grep -r "\.agent/\.agent/" .agent/core/` 应返回零结果。

### 0.2 修复文件行数上限矛盾

**问题:** `core/rules/common.md` 中 §1 写"800 行上限"，§9 写"300 行上限"。

**修复方案:** 在 `common.md` 中统一为分级标准:

```markdown
## 文件/函数尺寸规则 (统一标准)

| 指标 | HIGH (必须修复) | CRITICAL (阻断) |
|------|----------------|----------------|
| 单文件行数 | > 400 行 | > 600 行 |
| 单函数行数 | > 30 行 | > 50 行 |
| 嵌套深度 | > 3 层 | > 4 层 |
```

**改动文件:**
- `core/rules/common.md` §1: 删除"800 行上限"行，引用统一标准
- `core/rules/common.md` §9.1: 删除"300 行上限"行，引用统一标准

### 0.3 清理 V2 残留引用

**问题:** R6 铁律声明"V2 已彻底移除"，但仍有残留。

**修复清单:**

| # | 文件 | 行号 | 修改 |
|---|------|------|------|
| 1 | `core/workflows/ship.md` | L48 | 删除 `cd apps/api && pnpm dev  # V2` |

**验证:** `grep -ri "V2\|NestJS\|Prisma" .agent/core/workflows/ .agent/core/skills/` 确认无不当引用。

---

## Phase 1: 指令瘦身 — 核心优化

> **预计耗时: 2-3 天 | 难度: ★★★☆☆ | 优先级: 高**
> **目标: 将可加载指令从 ~8,150 行压缩到 ~4,900 行 (−40%)**

### 1.1 瘦身原则

```
原则 1: 删除所有"为什么"，只保留"做什么"
原则 2: 删除 ASCII 艺术图 → 用一句话描述
原则 3: 合并重复内容到真相源，其他只保留引用指针
原则 4: 示例代码只保留最小必要，完整模板移到 templates/
原则 5: 路由表保留（有效的 token 节约机制）
原则 6: 删除所有"释放上下文"相关指令（伪概念）
```

### 1.2 管理层 Skills ✅ (4 文件, ~1,325 行 → ~754 行, −43%)

#### `project-manager.md` (342 行 → ~180 行, −47%)

| 删除/压缩内容 | 行节省 | 理由 |
|--------------|--------|------|
| §2.3 领悟信号表 (L56-64) | −10 | PM 应有的常识，不需要教 |
| §3.1 翻译模板 (L72-99) — 压缩为 3 行指针 | −22 | 模板已在 templates/ 中 |
| §3.2 翻译原则 (L101-108) | −8 | 与 §2.1 铁律重复 |
| §5.1 督导循环 ASCII 图 (L154-173) | −20 | 改为: "按 build.md §0 状态机流转" |
| §5.5 用户反馈记录模板 (L230-240) | −12 | 移到 templates/ |
| §6.1 需求列表模板 (L252-270) | −18 | 移到 templates/ |
| §6.2 存储位置段落 | −5 | 合并到 project-structure.md |
| §7.1 风险登记模板 (L296-303) | −10 | 移到 templates/ |
| §8 沟通标准 (L313-321) | −10 | 常识级指令 |
| §10 L3 工具引用表 | −8 | 合并到 SKILL.md 统一引用 |
| 多余分隔线和版本行 | −10 | 格式精简 |

**保留:** §1 核心职责树, §2.1 铁律, §2.2 检查清单, §4 分诊矩阵, §5.2 督导铁律, §5.3 交付检查引用, §9 交接格式引用

#### `chief-engineer.md` (273 行 → ~160 行, −41%)

| 删除/压缩内容 | 行节省 | 理由 |
|--------------|--------|------|
| §1 职责定义 ASCII 树 (L14-26) | −13 | 改为一句话描述 |
| §2.2 复杂度评估表 (L49-57) | −10 | CTO 自行判断即可 |
| §4.1 协调机制表 (L101-109) | −10 | 常识级内容 |
| §4.2 问题上报格式 (L113-123) | −12 | 过于详细 |
| §5.1-5.4 整合验证 — 引用重复 | −30 | 大量引用 rules/common + build.md，保留指针 |
| §7 结对文件模板 (L207-222) | −16 | 移到 templates/ |
| §10 L3 引用表 | −8 | 合并到 SKILL.md |

**保留:** §2.1 接收检查清单, §3 分解原则+域路由+任务分配单, §5 最小验证动作, §6 变更管理, §9 交接格式引用

#### `qa-auditor.md` (465 行 → ~250 行, −46%)

| 删除/压缩内容 | 行节省 | 理由 |
|--------------|--------|------|
| §1 双重职责 ASCII 图 (L30-39) | −10 | 一句话替代 |
| §2.2 审计清单 — 删除"具体验证命令"列 | −20 | 命令在执行时再查 |
| §2.5 分场景模板 A/B/C — 合并为差异标签 | −25 | 3 个模板大量重复基础清单 |
| §2.6 影响半径 — 已在 rules/common.md §6 | −40 | 只保留 `→ rules/common.md §6` |
| §2.7 L3 引用表 | −8 | 合并 |
| §2.8 QA 自动化 — 已有 qa-gate.sh | −30 | 只保留 `bash .agent/core/scripts/qa-gate.sh` |
| §7 性能测试 k6 模板 (L396-422) | −28 | 移到 reference/ |
| §8 混沌工程 (L434-463) | −30 | 移到 reference/ (非日常) |
| §4 错误记录格式 — 已在 memory.md §3 | −25 | 只保留引用 |

**保留:** 路由表, §2.1 审计时机, §2.2 审计清单(精简版), §2.3 审计报告引用, §2.4 不通过处理, §3 实时质量监督, §5 SOP 更新触发条件, §9 交接格式

**新增:** `core/reference/performance-testing.md` (接收 §7), `core/reference/chaos-engineering.md` (接收 §8)

#### `memory.md` (456 行 → ~250 行, −45%)

| 删除/压缩内容 | 行节省 | 理由 |
|--------------|--------|------|
| §1.2 追踪器完整模板 (L47-86) | −25 | 移到 templates/tracker-template.md |
| §2.2 验收 5 步 — 压缩为紧凑列表 | −15 | 每步 2-3 行太冗长 |
| §2.3 ACCEPTED.md 格式 (L148-164) | −18 | 移到 templates/ |
| §3.2 错题本完整模板 (L200-230) | −20 | 已有 ERROR-BOOK.md 实例 |
| §3.5 交叉检查 5 步 (L309-326) | −18 | 压缩为 3 步核心 |
| §3.7 去重与加权 — 过度详细 | −20 | 精简为核心规则 |
| §4.2-4.3 完整规划模板 (L396-438) | −30 | 移到 templates/ |
| §5.3 上下文溢出预警 | −10 | 删除（基于伪概念） |
| §5 全节"释放"相关描述 | −15 | 改为语义暗示 |
| §6 L3 引用表 | −10 | 合并到 SKILL.md |

### 1.3 通用能力 Skills ✅ (5 文件, ~1,062 行 → ~430 行, −59%)

#### `requirements.md` (301 行 → ~150 行, −50%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| Phase 1 采集清单完整模板 (L66-97) | −25 | 移到 templates/gather-report-template.md |
| Phase 2 完整 Spec 模板 (L106-150) | −40 | 移到 templates/spec-template.md |
| Phase 4.2 进度记录示例 (L220-228) | −10 | 已在 memory.md §1 |
| Phase 5 — 全部引用指针 | −20 | 压缩为 3 行引用 |
| L3 引用表 | −8 | 合并 |

#### `collaboration.md` (267 行 → ~140 行, −48%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §2.1-2.3 协作场景 ASCII 图 (L25-72) | −48 | 改为文字描述: "Schema→Entity→API→前端 串行; 安全约束先行" |
| §3.1 交接记录格式 (L80-95) | −15 | 移到 templates/ |
| §4.2 讨论格式模板 (L122-138) | −18 | 移到 templates/ |
| §7.1-7.2 变更影响矩阵+传播检查 | −30 | 与 rules/common.md §6 重复，只保留组织层面（谁通知谁） |
| §7.4 链式影响示例 | −12 | 用 §7.1 已覆盖 |

#### `agent-mastery.md` (191 行 → ~100 行, −48%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §1 渐进检索 ASCII 图 (L35-43) | −10 | 用表格替代 |
| §2.1-2.4 上下文管理 — 删除"释放"伪概念 | −25 | 改为: "按需加载，不重复读取" |
| §3 错误处理+进程管理表 | −20 | 常识级内容压缩 |
| §3.1 Auto-Run 完整表 | −18 | 压缩为 3 条核心规则 |
| §5 Skill Seekers 详情 | −15 | 移到 warehouse 引用 |

#### `handoff.md` (153 行 → ~80 行, −48%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §2 完整检查点格式 (L27-58) | −20 | 移到 templates/checkpoint-template.md |
| §5 主动切分完整示例 (L96-118) | −22 | 压缩为规则: "> 10 步任务需规划切分点" |
| §6 紧急交接格式 | −10 | 合并到 §2 模板的简化模式 |

#### `continuous-learning.md` (150 行 → ~30 行, −80%)

**重写为可执行的精简版:**

```markdown
# 持续学习协议 (v2.0)

## 学习时机
- 任务关闭时: 回顾可复用模式
- 用户纠正时: 立即按 memory.md §3.5 分类记录

## 学习输出
| 类型 | 写入位置 |
|------|---------|
| 代码错误/Bug | ERROR-BOOK.md |
| 需求理解/UIUX | PROJECT-MEMORY.md |
| 流程改进 | data/training/*.md |
| 通用工程模式 | 对应 L1 Skill (需 CTO 批准) |

## 沉淀标准
- 同一模式 2 次 → 记录
- 同一模式 3+ 次 → 升级为 Skill 规则
- 用户说"记住这个" → 立即记录

## 模式检测类型
| 类型 | 触发 |
|------|------|
| user_corrections | 用户修正了做法 |
| error_resolutions | 解决了棘手 Bug |
| repeated_workflows | 同一流程 3+ 次 |
| project_conventions | 项目独特约定 |
```

**删除:** §2 本能模型 YAML, §3 置信度评分, §4 Antigravity 适配（未落地）

### 1.4 工程师 Skills ✅ (10 文件, ~3,624 行 → 2,694 行, −26%)

**实际结果:**

| 文件 | 完成行数 | 主要删减 |
|------|---------|---------|
| `infrastructure.md` | 164 | K8s YAML/Dockerfile/docker-compose/CI-CD 全压缩 |
| `backend.md` | 264 | Gradle 依赖表、DDD 骨架、application.yml → 关键值表 |
| `security.md` | 279 | ASCII 架构图、SecurityConfig/AOP/AES 压缩 |
| `integration.md` | 269 | Springdoc 配置、契约测试目的、网关 ASCII 压缩 |
| `observability.md` | 301 | 三支柱 ASCII、手动 Span、Dashboard ASCII、postmortem 外迁 |
| `platform.md` | 281 | 技术债模板外迁 |
| `frontend.md` | 314 | 目录树、API 流、解耦 ASCII、Sentry 代码压缩 |
| `performance.md` | 252 | 仅 L3 批量删除 |
| `messaging.md` | 236 | 仅 L3 批量删除 |
| `data.md` | 334 | 仅 L3 批量删除 |

### 1.5 Workflows ✅ (3 文件, 1,008 行 → 839 行, −17%)

#### `build.md` (432 行 → ~280 行, −35%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §0 状态机解释表格 (L101-113) | −15 | 保留图，删除解释 |
| §3.1 执行规则 — 全是引用 | −15 | 压缩为 5 行核心 |
| §3.1.1 重构保真 — 已在 rules/common.md §11 | −12 | 只保留引用 |
| §4 置信度过滤 — 已在 chief-engineer.md | −12 | 只保留引用 |
| §6 关闭后操作 — 合并脚本调用 | −20 | 合并为一个脚本入口 |
| V3 架构合规段落 | −15 | 移到共享引用 |
| 问题复盘铁律 (§6 中) | −5 | 移到 rules/common.md §12 |

#### `guard.md` (285 行 → ~180 行, −37%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §4 构建错误修复 (L135-160) | −20 | 常识级内容压缩为 5 行 |
| §5 故障排查 (L163-188) | −20 | 常识级流程压缩为 5 行 |
| 重复的"问题复盘铁律" (§4/§5/§6 各一处) | −30 | 统一引用 rules/common.md §12 |
| V3 架构合规段落 | −15 | 移到共享引用 |

#### `ship.md` (294 行 → ~180 行, −39%)

| 删除/压缩 | 行节省 | 理由 |
|-----------|--------|------|
| §1 V2 启动命令 | −2 | Phase 0 已修 |
| §2 完整 Dockerfile (L89-105) | −18 | 移到 reference/dockerfile-template.md |
| §4 完整 K8s YAML (L153-199) | −48 | 移到 reference/k8s-templates.md |
| V3 架构合规段落 | −15 | 移到共享引用 |
| 重复的"问题复盘铁律" (§1/§6) | −10 | 统一引用 |

#### `ui.md` — 保持不变（需单独评估）

### 1.6 Rules (3 文件, ~517 行 → ~400 行)

#### `common.md` (316 行 → ~260 行)

| 改动 | 行节省 |
|------|--------|
| §1 + §9 行数上限矛盾 → 统一 (Phase 0 已修) | −5 |
| §6 bash 示例压缩 | −8 |
| §9.2-9.3 复用检查 — 与 §6 高度重叠 → 合并 | −20 |
| §10 反死循环 — 压缩为核心规则表 | −15 |
| 新增 §12: 问题复盘铁律（从 guard/ship 收拢） | +5 |

**backend.md + frontend.md**: 保持不变（已经精炼）

### 1.7 模板外迁汇总

以下模板从 Skill 文件中提取到 `core/templates/`:

| 新模板文件 | 来源 |
|-----------|------|
| `templates/tracker-template.md` | memory.md §1.2 |
| `templates/accepted-template.md` | memory.md §2.3 |
| `templates/spec-template.md` | requirements.md Phase 2 |
| `templates/gather-report-template.md` | requirements.md Phase 1 |
| `templates/checkpoint-template.md` | handoff.md §2 |
| `templates/user-feedback-template.md` | project-manager.md §5.5 |
| `templates/requirements-list-template.md` | project-manager.md §6.1 |
| `templates/risk-register-template.md` | project-manager.md §7.1 |
| `templates/discussion-template.md` | collaboration.md §4.2 |
| `templates/handoff-record-template.md` | collaboration.md §3.1 |

### 1.8 Reference 外迁汇总

以下内容从 Skill/Workflow 文件中提取到 `core/reference/`:

| 新参考文件 | 来源 |
|-----------|------|
| `reference/performance-testing.md` | qa-auditor.md §7 |
| `reference/chaos-engineering.md` | qa-auditor.md §8 |
| `reference/v3-architecture-gate.md` | build.md/guard.md/ship.md V3 架构合规段落 |
| `reference/dockerfile-template.md` | ship.md §2 |
| `reference/k8s-templates.md` | ship.md §4 |

---

## Phase 2: 架构优化 — Express Path + 角色简化

> **预计耗时: 1-2 天 | 难度: ★★★☆☆ | 优先级: 高**

### 2.1 新增 Express Path (快速通道)

**改动文件:** `workflows/contact.md`

在现有流程前新增判定逻辑:

```markdown
## 快速通道判定 (Express Path)

PM 领悟后，先判定任务复杂度:

### Express 条件（全部满足才走 Express）
- [ ] 影响 ≤ 2 文件
- [ ] 无数据库 Schema 变更
- [ ] 无安全/权限变更
- [ ] 非重构/迁移任务
- [ ] 用户说"直接做"/"快速修"（可选加速）

### Express Path 流程
PM 领悟 → 复述确认 → 直接执行 → 验证门禁 (rules/common.md §5)
→ delivery-gate-output-template → 交付

### Standard Path 流程 (现有完整流程)
任何不满足 Express 条件的任务 → build.md §0-§7 完整状态机
```

**预期收益:** 简单任务效率提升 40-50%（跳过 Spec/CTO/QA 节省 ~5,000 tokens）

### 2.2 新增用户覆盖机制

**改动文件:** `workflows/contact.md`

```markdown
## 用户覆盖 (User Override)

| 用户说 | PM 行为 |
|--------|---------|
| "直接做" / "跳过确认" | Express Path, 跳过 Spec 确认环节 |
| "不需要审查" / "我自己看" | 跳过 QA_AUDIT, 直接 PM_VERIFY |
| "详细走流程" | 强制 Standard Path |
| "帮我规划一下" | 只输出 Spec, 等待确认再执行 |

> 用户覆盖的优先级高于 Express 判定。
```

### 2.3 瘦身 contact.md (入口归位)

**当前:** 106 行（承载 6 种职责）
**目标:** ~45 行（thin router + Express 判定）

| 移出内容 | 移到 | 理由 |
|---------|------|------|
| 交付铁律段落 (~10 行) | `rules/common.md` 新增 §0: 交付铁律 | 规则归规则层 |
| Token 管控铁律 (~8 行) | 删除，只保留 2 行核心 | 大部分是伪概念 |
| 防复犯协议详细步骤 (~12 行) | 只保留 `→ memory.md §3.5` | 避免重复 |
| V3 架构真相源 (~8 行) | `reference/v3-architecture-gate.md` | 三个 workflow 共用 |

**保留:**
- Express Path 判定（新增）
- 用户覆盖（新增）
- PM 行动清单（精简为 4 行）
- 工作流路由表
- 第一句话模板

### 2.4 build.md 增加模式选择

**改动文件:** `core/workflows/build.md`

在 §0 状态机前新增:

```markdown
## 执行模式

### Express Mode (简单任务)
负责人: PM 一人贯穿
流程: 领悟 → 执行 → 验证 (rules/common.md §5) → 交付
加载: contact.md + 对应域 SOP section + rules
跳过: Spec/CTO分配/QA审计

### Standard Mode (复杂任务)
负责人: PM → CTO → 工程师 → CTO → QA → PM
流程: §0-§7 完整状态机
加载: 按阶段渐进加载

### 模式选择
由 PM 在 contact.md 的 Express Path 判定中自动选择。
Express 不满足 → 自动进入 Standard。
```

---

## Phase 3: 去重与合并

> **预计耗时: 1-2 天 | 难度: ★★☆☆☆ | 优先级: 中**

### 3.1 创建共享协议中心

**新建:** `core/reference/shared-protocols.md`

将分散在多处的重复协议集中为唯一真相源引用:

```markdown
# 共享协议中心 (唯一引用索引)

| 协议 | 真相源位置 | 引用方式 |
|------|-----------|---------|
| 验证循环 6 阶段 | `rules/common.md` §5 | `→ rules/common.md §5` |
| 影响半径分析 4 步 | `rules/common.md` §6 | `→ rules/common.md §6` |
| 问题复盘铁律 | `rules/common.md` §12` | `→ rules/common.md §12` |
| 交付闸门 | `templates/delivery-gate-output-template.md` | `→ templates/delivery-gate-output-template.md` |
| 禁止猜测 | `project-manager.md` §2.1 | 其他文件不再重复 |
| V3 架构合规 | `reference/v3-architecture-gate.md` | `→ reference/v3-architecture-gate.md` |
```

### 3.2 逐文件去重清单

| 重复内容 | 删除位置 | 保留位置 | 替换为 |
|---------|---------|---------|--------|
| 验证循环 6 阶段 | qa-auditor §2.2 审计清单中的重复项, build §5 重复描述, requirements §5.3 | `rules/common.md §5` | `→ rules/common.md §5` |
| 影响半径分析 | qa-auditor §2.6 完整 40 行, collaboration §7.1-7.2 矩阵+检查 | `rules/common.md §6` | `→ rules/common.md §6` |
| "禁止猜测" | requirements Phase 3, memory §3, build §3, contact | `PM §2.1` | 删除多余出现 |
| 问题复盘铁律 | guard §4/§5/§6, ship §1/§6, build §6 (共 6 处) | 新增 `rules/common.md §12` | `→ rules/common.md §12` |
| V3 架构合规 | build.md 段落, guard.md 段落, ship.md 段落 | 新建 `reference/v3-architecture-gate.md` | `→ v3-architecture-gate.md` |
| L3 工具引用表 | 每个 Skill 末尾 (~20 处) | SKILL.md 新增 §L3 统一表 | 删除各文件独立表 |

**预期节省:** ~300 行 / ~2,400 tokens

### 3.3 collaboration.md §7 与 rules/common.md §6 合并

**当前问题:** 两者描述同一件事——"改了文件后检查影响"。

**合并方案:**
- `rules/common.md §6` **保留**: 技术层面（bash grep 命令 + 追踪步骤）
- `collaboration.md §7` **精简为**: 组织层面（变更影响矩阵：谁改了什么需要通知谁）
- 删除 collaboration.md §7 中的 bash 命令和技术追踪步骤
- 两者交叉引用

### 3.4 L3 工具引用表统一

**当前:** 20+ 个文件 × ~8 行/表 = ~160 行重复

**改动:**

1. 在 `SKILL.md` 底部新增统一 L3 引用表:

```markdown
## L3 工具统一引用 (按场景)

| 场景 | 工具 | 路径 | 关联角色 |
|------|------|------|---------|
| 任务分解 | ECC: Planner | warehouse/tools/everything-claude-code/01-agents-review.md §2 | CTO |
| 代码审查 | ECC: Reviewer | warehouse/tools/everything-claude-code/01-agents-review.md §3 | QA, CTO |
| 强制规则 | ECC: Rules | warehouse/tools/everything-claude-code/02-rules-hooks.md §1 | 全员 |
| TDD 流程 | ECC: Testing | warehouse/tools/everything-claude-code/02-rules-hooks.md §2 | 工程师 |
| UI 设计 | UI UX Pro: Design | warehouse/tools/ui-ux-pro-max/01-design-system.md | 前端 |
| UX 审查 | UI UX Pro: UX Rules | warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md | QA, PM |
| 动画 | Anime.js | warehouse/tools/animejs/INDEX.md | 前端 |
| 技能生成 | Skill Seekers | warehouse/tools/skill-seekers/01-commands-modules.md | 平台 |
| 记忆架构 | Claude-Mem | warehouse/tools/claude-mem/01-architecture.md | 全员 |
| Skill 规范 | Anthropic Skills | warehouse/tools/anthropic-skills/01-spec-template.md | 平台 |
```

2. 删除每个 Skill 和 Workflow 文件末尾的独立 L3 引用表
3. 域索引 (`domains/*.md`) 保留域级推荐（更精准）

---

## Phase 4: 记忆系统落地

> **预计耗时: 1 天 | 难度: ★★☆☆☆ | 优先级: 中**

### 4.1 continuous-learning.md 重写

见 Phase 1.3 中的重写版本（30 行精简执行版）。

删除: 本能模型 YAML, 置信度评分, Antigravity 适配, `/evolve` 引用。

### 4.2 ERROR-BOOK 自动匹配增强

**改动文件:** `core/skills/memory.md` §3.4

新增自动匹配协议:

```markdown
### 3.4A 自动匹配协议 (每次任务 ASSIGNED 后)

1. 提取当前任务关键词: 模块名 + 技术栈 + 操作类型
2. grep 匹配 ERROR-BOOK.md 关键词索引
3. 命中条目:
   → 读取条目内容
   → 在 CTO 任务工单"注意事项"字段标注: "⚠️ ERR-XXX 警告"
4. 未命中 → 继续

规则: Express Path 也必须执行此匹配（精简版: 只匹配，不写工单）
```

### 4.3 PROJECT-MEMORY 结构化增强

**改动文件:** `.agent/projects/mgmt/data/progress/PROJECT-MEMORY.md`

增强为分类结构:

```markdown
# PROJECT-MEMORY (可复用需求)

> 每次任务结束，将可复用需求增量写入对应分类。
> 冲突时优先回到用户确认。

## UIUX 偏好 (weight 排序)
| ID | 规则 | weight | last_seen |
|----|------|--------|-----------|

## 数据口径
| ID | 规则 | weight | last_seen |
|----|------|--------|-----------|

## 业务规则
| ID | 规则 | weight | last_seen |
|----|------|--------|-----------|

## 技术约定
| ID | 规则 | weight | last_seen |
|----|------|--------|-----------|
```

### 4.4 新增 rules/common.md §12: 问题复盘铁律

**改动文件:** `core/rules/common.md`

从 guard.md/ship.md/build.md 中收拢重复段落为唯一真相源:

```markdown
## 12. 问题复盘铁律 (🔴 强制 — 每次错误修复后必做)

1. **记录**: 写入 `.agent/projects/{project}/data/errors/ERROR-BOOK.md`
   - 格式: `memory.md` §3.2
   - 关键词索引更新
2. **交叉检查**: 抽象错误模式 → grep 搜索同类代码 → 逐一检查 → 批量修复
   - 流程: `memory.md` §3.5
3. **确认**: 零同类残留

> 不执行复盘 = 不完整的修复 = 驳回。
```

---

## Phase 5: Antigravity 适配准备

> **预计耗时: 2-3 天 | 难度: ★★★★☆ | 优先级: 评估后决定**
> **前提: Phase 0-4 完成 + 决定迁移 Antigravity**

### 5.1 Skills 格式映射设计

将 `.agent/core/skills/` 映射为 Antigravity Skills 格式:

```
当前:                            Antigravity:
────────                        ─────────────
core/skills/backend.md          → skills/backend-engineer/
  frontmatter (name/desc)          ├── skill.yaml (metadata + triggers)
  §1-§7 sections                   └── instructions.md (heavy content)

core/skills/domains/service.md  → skills/service-domain/
  工程师索引表                      ├── skill.yaml (triggers = keywords)
  关键词→section 映射               └── instructions.md (routing logic)
```

**skill.yaml 标准格式:**

```yaml
name: backend-engineer
display_name: 后端架构师
description: Kotlin/Spring Boot 3 DDD 分层, 事务管理, 测试规范
version: "2.0.0"
triggers:
  - "Kotlin"
  - "Spring Boot"
  - "API"
  - "Controller"
  - "Service"
  - "Repository"
  - "后端"
  - "事务"
dependencies:
  - data-engineer
  - security-engineer
context_budget: "3500 tokens"
```

### 5.2 完整映射清单

| 当前文件 | Antigravity Skill | triggers 示例 |
|---------|-------------------|---------------|
| `project-manager.md` | `pm-agent/` | 需求, 交付, 确认, 验收 |
| `chief-engineer.md` | `cto-agent/` | 分配, 分解, 协调, 整合 |
| `qa-auditor.md` | `qa-agent/` | 审计, 审查, 测试, 质量 |
| `memory.md` | `memory-manager/` | 追踪, 验收, 错题, 记忆 |
| `requirements.md` | `requirements-wizard/` | 需求, spec, wizard |
| `collaboration.md` | `collaboration/` | 交接, 依赖, 协作 |
| `handoff.md` | `session-handoff/` | 检查点, 恢复, 交接 |
| `backend.md` | `backend-engineer/` | Kotlin, Spring, API |
| `frontend.md` | `frontend-engineer/` | React, Next.js, 组件 |
| `data.md` | `data-engineer/` | PostgreSQL, Redis, Schema |
| `security.md` | `security-engineer/` | 认证, 授权, 权限 |
| `integration.md` | `integration-engineer/` | REST, OpenAPI, 第三方 |
| `messaging.md` | `messaging-engineer/` | Kafka, 消息, 事件 |
| `infrastructure.md` | `infra-engineer/` | Docker, K8s, CI/CD |
| `observability.md` | `observability-engineer/` | Prometheus, 日志, 告警 |
| `performance.md` | `performance-engineer/` | 缓存, N+1, 性能 |
| `platform.md` | `platform-engineer/` | 脚手架, 技术债 |
| `agent-mastery.md` | `agent-behavior/` | 检索, 上下文 |
| `continuous-learning.md` | `learning/` | 学习, 模式, 经验 |

### 5.3 Multi-Agent 编排设计

**Mission Template: Standard Build**

```
Mission: "{任务名称}"
├── Agent 1: PM Agent (Claude)
│   ├── Skills: pm-agent, requirements-wizard, memory-manager
│   ├── Phase: 领悟 → Spec → 确认
│   ├── Output Artifact: spec-{task-id}.artifact
│   └── 交付 → Agent 2
│
├── Agent 2: CTO Agent (Claude)
│   ├── Skills: cto-agent, collaboration
│   ├── Input: spec-{task-id}.artifact
│   ├── Phase: 分解 → 分配
│   ├── Output Artifact: task-plan-{task-id}.artifact
│   └── 交付 → Agent 3 + Agent 4 (并行)
│
├── Agent 3: Backend Agent (Claude) [并行]
│   ├── Skills: backend-engineer, data-engineer, security-engineer
│   ├── Input: task-plan worklet
│   ├── Output Artifact: backend-completion-{task-id}.artifact
│   └── 交付 → Agent 5
│
├── Agent 4: Frontend Agent (Claude) [并行, 等待 API 契约]
│   ├── Skills: frontend-engineer
│   ├── Input: task-plan worklet + API Contract from Agent 3
│   ├── Output Artifact: frontend-completion-{task-id}.artifact
│   └── 交付 → Agent 5
│
├── Agent 5: QA Agent (Claude)
│   ├── Skills: qa-agent, rules (common/backend/frontend)
│   ├── Input: All completion artifacts
│   ├── Output Artifact: qa-report-{task-id}.artifact
│   └── 通过 → Agent 1 / 驳回 → Agent 2
│
└── Agent 1: PM Agent (恢复)
    ├── Input: qa-report artifact
    ├── Output: delivery-gate artifact → 用户
    └── 用户确认 → CLOSED
```

**Mission Template: Express Build**

```
Mission: "{简单任务}"
├── Agent 1: PM+Engineer Agent (Claude)
│   ├── Skills: pm-agent, {对应工程师 skill}, rules
│   ├── Phase: 领悟 → 执行 → 验证 → 交付
│   ├── Output Artifact: delivery-gate artifact
│   └── → 用户
```

### 5.4 Artifact 格式映射

| 当前模板 | Antigravity Artifact | 附加能力 |
|---------|---------------------|---------|
| `delivery-gate-output-template.md` | `delivery-gate.artifact` | 截图, 浏览器录屏 |
| `cto-task-decomposition-template.md` | `task-plan.artifact` | 内联评论, 版本追踪 |
| `qa-report-template.md` | `qa-report.artifact` | 自动附加测试日志 |
| `engineer-completion-report-template.md` | `completion-report.artifact` | 自动附加 git diff |
| `rework-ticket-template.md` | `rework-ticket.artifact` | 关联到原 artifact |

### 5.5 Knowledge Base 映射

| 当前存储 | Antigravity Knowledge | 迁移方式 |
|---------|----------------------|---------|
| `ERROR-BOOK.md` | `knowledge/error-patterns/*` | 每个 ERR-XXX → 独立 Knowledge Item |
| `PROJECT-MEMORY.md` | `knowledge/project-conventions/*` | 每个 MEM-XXX → 独立 Knowledge Item |
| `data/training/*.md` | `knowledge/training/*` | 直接迁移 |
| `ACCEPTED.md` | Artifact 状态标记 | 已验收 artifact 标记 accepted |
| `TRACKER-*.md` | Mission 内置追踪 | 平台原生替代 |

### 5.6 保留不迁移的部分

| 组件 | 保留原因 | 存储位置 |
|------|---------|---------|
| `projects/mgmt/reference/*.md` | 项目特定深度技术文档 | 项目工作区文件 |
| `projects/mgmt/playbooks/*.md` | 组合 SOP 策略 | Skills instructions |
| `core/rules/*.md` | 强制规则 | skill.yaml 依赖引用 |
| `core/scripts/*.sh` | 可执行脚本 | Agent Steps |
| `warehouse/tools/` | SDK 参考 | Skills 按需引用 |

---

## Phase 6: Antigravity 迁移执行

> **预计耗时: 3-5 天 | 难度: ★★★★★ | 优先级: Phase 5 POC 通过后**

### 6.1 执行时间线

```
Week 1: 基础设施 + POC
├── Day 1: 安装 Antigravity + 配置 Claude 模型
├── Day 2: 创建项目工作区 + 迁移 L4 数据
├── Day 3: POC — 一个中等任务端到端验证
└── 验收: 基本编辑/终端/Skills 加载正常

Week 2: Skills 迁移
├── Day 4: 迁移 3 域索引 + 5 管理层 Skills
├── Day 5: 迁移 10 工程师 Skills
├── Day 6: 迁移 Rules + Templates → Skill 依赖
└── 验收: 域路由和按需加载工作正常

Week 3: Workflow + Multi-Agent
├── Day 7: 迁移 build/guard/ship/ui → Mission Templates
├── Day 8: 设计并测试 Multi-Agent 编排
├── Day 9: 迁移模板 → Artifact 格式
└── 验收: Standard Path + Express Path 端到端

Week 4: Knowledge + 验收
├── Day 10: 迁移 ERROR-BOOK + PROJECT-MEMORY → Knowledge
├── Day 11: 配置 Agent 学习行为 + Knowledge 自动沉淀
├── Day 12: 完整回归测试
└── 最终验收: 与 Claude Code 效果对比
```

### 6.2 POC 验证标准 (Week 1 Day 3)

选一个中等复杂度任务（如"新增一个 API 端点 + 前端列表页"）:

| 验证项 | 通过标准 |
|--------|---------|
| Claude 模型响应质量 | 与 Claude Code 相当或更好 |
| Skills 按需加载 | 只加载相关 Skill，非全量 |
| Agent 间 Artifact 传递 | CTO → 工程师 Artifact 完整可读 |
| 终端命令执行 | gradlew build / pnpm dev 正常 |
| Knowledge 持久化 | 写入的 Knowledge 在新会话可检索 |

### 6.3 回退策略

```
Phase 5-6 期间，保留 .agent/ 原始目录不动。

迁移在独立目录:
  .antigravity/
  ├── skills/          ← 迁移后的 Skills
  ├── missions/        ← Mission Templates
  ├── artifacts/       ← Artifact 定义
  └── knowledge/       ← Knowledge Items

验收通过:
  .agent/ → .agent.archive/ (归档保留)
  .antigravity/ → 主工作区

验收不通过:
  删除 .antigravity/
  继续使用优化后的 .agent/ (Phase 0-4 的成果仍然有效)
```

### 6.4 风险缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| Claude 在 Antigravity 表现不如 Gemini | 中 | POC 阶段验证; 保留 Claude Code 回退 |
| Skills 格式转换丢失语义 | 低 | 逐文件对比验证; 保留原文件 |
| Multi-Agent 协调开销 > 单 Agent | 中 | 先用 Express (单 Agent) + Standard (Multi) 混合模式 |
| Knowledge Base 检索精度不如 ERROR-BOOK | 中 | 保留 ERROR-BOOK 关键词索引作为补充 |
| 迁移期间影响开发进度 | 高 | 分 Week 执行; 每 Week 有独立验收; 随时可暂停 |

---

## 附录 A: 文件变更总览

### Phase 0 变更文件 (7 个)

| 文件 | 操作 |
|------|------|
| `core/skills/chief-engineer.md` | 修复路径 |
| `core/skills/project-manager.md` | 修复路径 (3 处) |
| `core/skills/qa-auditor.md` | 修复路径 (2 处) |
| `core/skills/requirements.md` | 修复路径 |
| `core/skills/memory.md` | 修复路径 |
| `core/rules/common.md` | 修复行数矛盾 |
| `core/workflows/ship.md` | 删除 V2 命令 |

### Phase 1 变更文件 (24 个)

| 文件 | 操作 |
|------|------|
| 4 管理层 Skills | 瘦身 (~1,325 → ~750 行) |
| 5 通用能力 Skills | 瘦身 (~1,062 → ~500 行) |
| 10 工程师 Skills | 瘦身 (~3,624 → ~2,500 行) |
| 4 Workflows | 瘦身 (~1,100 → ~700 行) |
| 1 Rule (common.md) | 精简 + 新增 §12 |

### Phase 1 新建文件 (12 个)

| 文件 | 类型 |
|------|------|
| 10 个新模板 | templates/ (从 Skills 中外迁的模板) |
| 2 个新参考 | reference/ (performance-testing, chaos-engineering) |

### Phase 2 变更文件 (3 个)

| 文件 | 操作 |
|------|------|
| `workflows/contact.md` | 新增 Express Path + 用户覆盖 + 瘦身 |
| `core/workflows/build.md` | 新增模式选择 |
| `core/SKILL.md` | 新增 L3 统一引用表 |

### Phase 3 变更文件 (22 个)

| 文件 | 操作 |
|------|------|
| 20+ Skill/Workflow 文件 | 删除末尾 L3 引用表 |
| `collaboration.md` §7 | 精简（技术部分引用 rules §6） |
| `qa-auditor.md` §2.6 | 删除（引用 rules §6） |

### Phase 3 新建文件 (2 个)

| 文件 | 类型 |
|------|------|
| `reference/shared-protocols.md` | 引用索引 |
| `reference/v3-architecture-gate.md` | 从 3 个 workflow 合并 |

### Phase 4 变更文件 (3 个)

| 文件 | 操作 |
|------|------|
| `continuous-learning.md` | 重写 (150 → 30 行) |
| `memory.md` §3.4 | 新增自动匹配协议 |
| `PROJECT-MEMORY.md` | 结构化增强 |

---

## 附录 B: 执行检查清单

### Phase 0 检查清单 ✅ (2026-02-19 完成)
- [x] 所有 `.agent/.agent/` 路径已修复 (9 处, 跨 5 文件, 含计划外发现的 project-structure.md + requirements.md L57)
- [x] `grep -r "\.agent/\.agent/" .agent/core/` 返回零结果
- [x] 文件行数上限统一标准已写入 (§1 + §9 + qa-auditor 三处统一为 ≤600 行)
- [x] V2 残留引用已清除 (ship.md §1 V2 启动命令已删除)
- [x] `grep -ri "V2.*dev\|NestJS" .agent/core/` 返回零结果 (仅保留 requirements.md 中的"禁止使用 V2"警告规则)

### Phase 1 检查清单
- [x] 所有管理层 Skill ≤ 200 行 (§1.2 完成)
- [x] 所有通用能力 Skill ≤ 150 行 (§1.3 完成)
- [x] 所有工程师 Skill ≤ 350 行 (§1.4 完成，最大 334 行 data.md)
- [x] Workflow 瘦身完成 (§1.5: build 378, guard 256, ship 205 行，整体 -17%)
- [x] 无文件包含"释放上下文"/"释放 SOP"等伪概念指令
- [x] 外迁的模板已在 templates/ 中创建 (§1.7 完成，新增 15 个模板文件)
- [x] 路由表完整保留（未删除）
- [x] 外迁的参考已在 reference/ 中创建 (§1.8 完成，新增 4 个参考文件)

### Phase 2 检查清单 ✅ (2026-02-19 完成)
- [x] Express Path 判定逻辑已在 contact.md 中
- [x] 用户覆盖机制已在 contact.md 中
- [x] build.md 包含模式选择（Express/Standard）
- [x] contact.md 精简完成 (106 → 68 行, -36%)
- [ ] 实测: 简单任务走 Express Path 成功（需用户实际使用验证）

### Phase 3 检查清单 ✅ (2026-02-19 完成)
- [x] shared-protocols.md 已创建 (reference/shared-protocols.md)
- [x] v3-architecture-gate.md 已创建 (reference/v3-architecture-gate.md)
- [x] 所有 Skill/Workflow 末尾的 L3 引用表已删除 (requirements.md 最后 1 个已清除)
- [x] SKILL.md 包含统一 L3 引用表 (按场景 10 行表格)
- [x] 问题复盘铁律只在 rules/common.md §12 定义 (Phase 1.6 已完成)
- [x] build.md V3 段落压缩 → 指向 reference/v3-architecture-gate.md (390→372 行)

### Phase 4 检查清单 ✅ (2026-02-19 完成)
- [x] continuous-learning.md ≤ 40 行 (实际 40 行，Phase 1.3 已完成)
- [x] 无本能模型/置信度评分/Antigravity 适配内容 (Phase 1.3 已删除)
- [x] memory.md §3.4A 自动匹配协议已写入
- [x] PROJECT-MEMORY.md 包含 4 个分类表 (UIUX/数据口径/业务规则/技术约定)
- [x] rules/common.md §12 问题复盘铁律已写入 (§1.6 完成)

### Phase 5-6 检查清单
- [ ] Antigravity 安装并配置 Claude 模型
- [ ] POC 通过 5 项验证标准
- [ ] 所有 Skills 已转换为 skill.yaml + instructions.md
- [ ] Mission Templates (Standard + Express) 已创建
- [ ] Knowledge Items 已迁移
- [ ] 回归测试通过
- [ ] 与 Claude Code 效果对比报告已输出

---

*Plan authored by: Claude Opus 4.6*
*Date: 2026-02-19*
*Status: Pending approval*
