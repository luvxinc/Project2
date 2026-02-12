# Agent System V3.0 迭代计划

> **生成时间**: 2026-02-12 14:45 PST
> **PM**: 项目经理
> **触发方**: 用户要求严格审计全部工作流/SOP/职务，参考 ECC (42K⭐) 最佳实践
> **参考源**: [everything-claude-code v1.4.1](https://github.com/affaan-m/everything-claude-code)

---

## 一、审计总览：我们 vs ECC

### 架构对比

| 维度 | 我们 (Agent System v2.x) | ECC (v1.4.1) | 评估 |
|------|------------------------|--------------|------|
| **组织模型** | 企业级: PM → CTO → 10工程师 → QA | 扁平: 12 专职 Agent | 🟢 我们更高级 |
| **角色数** | 17 Skills + 4 Workflows | 12 Agents + 30+ Skills + 30+ Commands | 🟡 ECC 颗粒度更细 |
| **工作流** | 4 个 Workflow (build/guard/ship/ui) | 30+ Slash Commands | 🟡 ECC 入口更细化 |
| **TDD** | ✅ §1 有落地代码模板 | ✅ 专门 Agent + Skill + Command | 🟡 ECC 更系统 |
| **验证循环** | ✅ 6 阶段验证 (agent-mastery) | ✅ 6 阶段验证 (verification-loop) | 🟢 基本一致 |
| **代码审查** | ✅ §2 代码审查 (guard) | ✅ 专门 Agent + Review Checklist | 🟡 ECC 清单更详尽 |
| **安全审查** | ✅ 12 项安全检查 | ✅ AgentShield (387 tests) | 🟡 ECC 有工具支持 |
| **持续学习** | ✅ Instinct 架构 (适配 KI) | ✅ Instinct v2 (原版) | 🟢 基本一致 |
| **编码标准** | ✅ 文件/函数限制 + 异味检测 | ✅ 同 + 不可变性 + 输入验证 | 🟢 基本一致 |
| **上下文管理** | ✅ 4 级阈值 + Checkpoint | ✅ 同 | 🟢 一致 |
| **Hooks (自动化)** | ❌ 无 | ✅ PreToolUse/PostToolUse/Stop | 🔴 我们缺失 |
| **Rules (强制规则)** | ❌ 散布在各 Skill 中 | ✅ 独立 rules/ 目录，分语言 | 🔴 我们缺失 |
| **工程师自检** | ❌ 无 (只有 QA 事后审计) | ✅ 编码前/后自动检查 | 🔴 我们缺失 |
| **Dynamic Contexts** | ❌ 无 | ✅ dev/review/research 模式切换 | 🟡 可选增强 |

---

### 当前系统状态审计 (17 Skills)

| # | Skill 文件 | 大小 | 内容质量 | 问题 |
|---|-----------|------|----------|------|
| 1 | `project-manager.md` | 6.8KB | ✅ 完整 | 无 |
| 2 | `chief-engineer.md` | 5.9KB | ✅ 完整 | 无 |
| 3 | `qa-auditor.md` | 9.4KB | ✅ 完整 | 无 |
| 4 | `collaboration.md` | 4.9KB | ✅ 完整 | 无 |
| 5 | `requirements.md` | 7.5KB | ✅ 完整 | 无 |
| 6 | `handoff.md` | 3.2KB | ✅ 完整 | 无 |
| 7 | `backend.md` | 14.3KB | ✅ 完整 | **缺少：完成后自检清单** |
| 8 | `frontend.md` | 13.4KB | ✅ 完整 | **缺少：完成后自检清单** |
| 9 | `data.md` | 10.7KB | ✅ 完整 | 无 |
| 10 | `messaging.md` | 6.5KB | ✅ 完整 | 无 |
| 11 | `integration.md` | 7.3KB | ✅ 完整 | 无 |
| 12 | `security.md` | 13.4KB | ✅ 完整 | 无 |
| 13 | `infrastructure.md` | 13.2KB | ✅ 完整 | 无 |
| 14 | `observability.md` | 14.5KB | ✅ 完整 | 无 |
| 15 | `performance.md` | 6.4KB | ✅ 完整 | 无 |
| 16 | `platform.md` | 7.2KB | ✅ 完整 | 无 |
| 17 | `agent-mastery.md` | 18.9KB | ✅ 完整 | **可精简：Skill Seekers 部分过大** |

### 当前工作流状态审计 (4 Workflows)

| # | Workflow | 大小 | 状态 | 问题 |
|---|----------|------|------|------|
| 1 | `build.md` (/main_build) | 11.4KB | ✅ 完整 | §7 验证门禁 ✅ 文件管理 ✅ |
| 2 | `guard.md` (/main_guard) | 7.5KB | ✅ 完整 | §1 TDD ✅ §2 审查 ✅ §3 安全 ✅ §4 构建错误 ✅ |
| 3 | `ship.md` (/main_ship) | 7.2KB | ✅ 完整 | §1-§6 全部有实质内容 ✅ |
| 4 | `ui.md` (/main_ui) | 7.6KB | ✅ 完整 | §1-§3 全部有实质内容 ✅ |

### L2 入口引用审计

| 入口文件 | 指向 | 问题 |
|---------|------|------|
| `workflows/contact.md` | PM SOP | ⚠️ 引用路径格式不是 symlink |
| `workflows/main_build.md` | 内联, 11KB | ✅ 但 README 说是指向 core/workflows/build.md (不存在) |
| `workflows/main_guard.md` | 内联, 7.5KB | ✅ 同上问题 |
| `workflows/main_ship.md` | 内联, 7.2KB | ✅ 同上问题 |
| `workflows/main_ui.md` | 内联, 7.6KB | ✅ 同上问题 |

> **🔴 重要发现**: README.md 标注了 `core/workflows/` 目录存在 `build.md, ship.md, guard.md, ui.md`，但实际上 Workflow 内容是直接写在 `workflows/main_*.md` 中。`core/workflows/` 目录可能不存在或为空。但功能上这不影响使用，因为 Antigravity 读取 `.agent/workflows/` 而非 `core/workflows/`。

---

## 二、差距分析 (从 ECC 学到的关键能力)

### 🔴 关键差距 (必须补)

| # | 差距 | 影响 | ECC 对应 | 优先级 |
|---|------|------|----------|--------|
| **G1** | **工程师自检 SOP 缺失** | 错误发现晚，QA 负担重 | code-reviewer checklist | P0 |
| **G2** | **Rules 缺失 (强制规则层)** | 每次靠记忆，没有强制约束 | `rules/common/*.md` | P0 |
| **G3** | **L4 参考文件 v2-architecture.md 已过时** | 引用已删除的 V2 NestJS 内容 | — | P0 |

### 🟡 重要增强 (应该补)

| # | 差距 | 影响 | ECC 对应 | 优先级 |
|---|------|------|----------|--------|
| **G4** | 工程师 Skill 缺少 **反模式清单** | 重复犯同类错误 | code-reviewer anti-patterns | P1 |
| **G5** | `agent-mastery.md` **过于臃肿** (18.9KB) | 违反自己的 30KB 加载上限规则 | 拆分为多个子 Skill | P1 |
| **G6** | **README.md 架构图与实际不一致** | core/workflows/ 目录描述不匹配 | — | P1 |
| **G7** | `/main_guard` 缺少 **TDD 修 Bug 专用流程** | TDD 有概念但没有 Bug 修复专用步骤 | tdd-guide agent workflows | P1 |
| **G8** | 缺少 **文档同步检查** | 代码改了但文档没跟上 | doc-updater agent | P1 |

### 🟢 可选优化 (锦上添花)

| # | 差距 | ECC 对应 | 优先级 |
|---|------|----------|--------|
| **G9** | Dynamic Contexts (dev/review/research 模式) | `contexts/*.md` | P2 |
| **G10** | 更细化的 Slash Commands (如 `/tdd`, `/plan`, `/code-review`) | 30+ commands | P2 |
| **G11** | AgentShield 安全自动扫描 | `npx ecc-agentshield scan` | P2 |
| **G12** | 多 Agent 编排 (`/orchestrate`, `/multi-plan`) | multi-agent orchestration | P3 |

---

## 三、迭代计划

### Phase 1: 关键基础设施 (预计 1 会话)

> **目标**: 补齐最关键的 3 个差距 (G1 + G2 + G3)

#### 1.1 创建 Rules 层 (`core/rules/`)

仿照 ECC 的 `rules/` 目录，创建强制约束规则：

```
core/rules/
├── README.md               # 规则索引 + 安装说明
├── common/                  # 语言无关
│   ├── coding-style.md      # 不可变性, 文件组织, 错误处理, 输入验证
│   ├── git-workflow.md      # Commit 格式, PR 流程, 分支策略
│   ├── testing.md           # TDD, 覆盖率 ≥ 80%
│   ├── security.md          # 密钥检查, SQL 注入, XSS
│   └── self-review.md       # ⭐ 新增: 工程师完成后自检清单
├── kotlin/                  # Kotlin / Spring Boot 特定
│   └── coding-standards.md
└── typescript/              # TypeScript / Next.js 特定
    └── coding-standards.md
```

**来源**: 从 `agent-mastery.md` §3 + `guard.md` §2 提取 + ECC `rules/common/` 最佳实践融合

#### 1.2 添加工程师自检 SOP (G1)

在 `backend.md` 和 `frontend.md` 末尾添加 **§N 完成后自检** section：

```markdown
## §N 完成后自检 (必做)

> **ECC 原则: 写代码后，列出可能的问题 + 建议测试用例**

### 自检清单

1. **安全** (🔴 CRITICAL — 必须 0 问题)
   - [ ] 无硬编码密钥/密码
   - [ ] 所有用户输入已验证
   - [ ] 权限注解已添加 (@PreAuthorize / middleware)
   - [ ] 无 SQL 注入风险
   - [ ] 无敏感数据泄露

2. **代码质量** (🟡 HIGH)
   - [ ] 函数 < 50 行，文件 < 800 行
   - [ ] 无 > 4 层嵌套
   - [ ] 错误处理完整
   - [ ] 不可变模式
   - [ ] 命名清晰

3. **框架特定** (🟡 HIGH)
   - [后端] Controller 无业务逻辑
   - [后端] @Transactional 在 Service 层
   - [后端] N+1 查询检查
   - [前端] useEffect 依赖完整
   - [前端] 无 console.log
   - [前端] Loading/Error/Empty 三态

4. **测试覆盖** (🟡 HIGH)
   - [ ] 核心路径有 Unit Test
   - [ ] 边界条件已测试
   - [ ] 列出 3 个潜在风险点 + 对应测试建议

5. **回归** (🟢 MEDIUM)
   - [ ] 现有功能不受影响
   - [ ] git diff 无意外变更
   - [ ] i18n 新文本已翻译
```

#### 1.3 清理过时 L4 参考文件 (G3)

- 审查 `reference/v2-architecture.md` — V2 已删除，标注为 **历史存档** 或删除
- 审查 `reference/migration-v2.md` — 迁移完成，标注为 **已完成归档**

---

### Phase 2: SOP 精炼 (预计 1 会话)

> **目标**: 精炼现有 SOP，增加反模式清单和 TDD Bug 修复流程

#### 2.1 拆分 `agent-mastery.md` (G5)

当前 18.9KB，违反 30KB 加载上限原则。拆分为：

| 原 Section | 新位置 | 大小预估 |
|-----------|--------|----------|
| §1 验证循环 | **保留** in agent-mastery.md | ~2KB |
| §2 渐进检索 | **保留** in agent-mastery.md | ~1.5KB |
| §3 编码标准 | **移至** `core/rules/common/coding-style.md` | ~2KB |
| §4 上下文管理 | **保留** in agent-mastery.md | ~2KB |
| §5 错误处理 | **保留** in agent-mastery.md | ~2KB |
| §6 持续学习 | **保留** in agent-mastery.md | ~4KB |
| §7 Skill Seekers | **移至** `warehouse/tools/skill-seekers.md` | ~5KB |

**预期效果**: agent-mastery.md 从 18.9KB 降到 ~12KB

#### 2.2 增强 `/main_guard` TDD Bug 修复流程 (G7)

在 `§1 TDD` 中添加 **§1.5 TDD 修 Bug 专用流程**：

```markdown
### §1.5 TDD 修 Bug (Bug Reproduction → Fix → Verify)

> **ECC 原则: 发现 Bug 时，先写测试重现，再修复直到通过**

```
1. 复现: 确认 Bug 可复现
2. 测试: 写一个精确描述 Bug 行为的失败测试
3. 验证: 运行测试 → 确认失败 (RED)
4. 修复: 写最小代码修复
5. 验证: 运行测试 → 确认通过 (GREEN)
6. 回归: 运行全量测试 → 确认无副作用
7. 文档: 记录根因和修复方案
```
```

#### 2.3 添加反模式清单到核心工程师 Skill (G4)

在 `backend.md` 和 `frontend.md` 中添加 **常见反模式** section，仿照 ECC code-reviewer 的详尽清单。

---

### Phase 3: 架构对齐 (预计 0.5 会话)

> **目标**: 修复架构文档与实际文件的不一致

#### 3.1 修复 README.md 架构图 (G6)

当前 README 标注了 `core/workflows/build.md` 等文件，但实际 Workflow 在 `workflows/main_build.md`。
需统一为以下二选一方案：

| 方案 | 描述 | 推荐 |
|------|------|------|
| **A: 移除 core/workflows/** | README 直接指向 `workflows/main_*.md`，删除 core/workflows/ 引用 | ✅ 推荐 |
| **B: 创建 core/workflows/** | 实际创建 core/workflows/build.md 等，workflows/main_*.md 变为指引 | 过度工程 |

#### 3.2 SKILL.md 路由表更新

更新 `core/SKILL.md` 中的 Workflow 路径引用，确保与实际文件一致。

#### 3.3 添加文档同步检查 (G8)

在 QA `§2 审计清单` 中添加：

```markdown
| **文档同步** | API 变更后相关文档已更新 | 🟡 | grep 扫描 + 人工检查 |
```

---

### Phase 4: 可选增强 (未来会话)

> **目标**: 锦上添花，根据实际需要择优实施

| 项目 | 描述 | 估时 |
|------|------|------|
| G9 Dynamic Contexts | 创建 `contexts/` 目录，支持 dev/review/research 模式切换 | 0.5h |
| G10 细化 Commands | 拆分 `/tdd`, `/review`, `/plan` 独立命令 | 1h |
| G11 安全扫描集成 | 集成 AgentShield 或自定义安全扫描脚本 | 1h |
| G12 多 Agent 编排 | 添加 `/orchestrate` 命令用于复杂多步骤任务 | 2h |

---

## 四、执行优先级矩阵

```
影响高 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       │ G1 工程师自检    G2 Rules 层  │
       │    (P0-必做)       (P0-必做)  │
       │                               │
       │ G7 TDD修Bug      G4 反模式    │
       │    (P1-应做)       (P1-应做)  │
影响 ──┤───────────────────────────────┤
       │ G3 过时文件      G5 拆分      │
       │    (P0-即做)      mastery     │
       │                   (P1-应做)   │
       │ G6 README修复  G8 文档同步    │
       │    (P1-应做)     (P1-应做)    │  
影响低 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       低努力                   高努力
```

---

## 五、不动的部分 (验证通过，无需改动)

| 组件 | 状态 | 理由 |
|------|------|------|
| PM SOP | ✅ 保持 | 需求领悟铁律完整，覆盖 ECC planner 所有功能点 |
| CTO SOP | ✅ 保持 | 四级复杂度矩阵 + 分配原则完整 |
| QA SOP | ✅ 保持 | 双重职责 + 14 项审计清单 + 错误归档 + SOP 更新（=ECC 自我进化） |
| 协作 SOP | ✅ 保持 | 跨团队协议完整 |
| 验证循环 | ✅ 保持 | 6 阶段与 ECC verification-loop 一致 |
| 渐进检索 | ✅ 保持 | 4 阶段检索与 ECC iterative-retrieval 一致 |
| 持续学习 | ✅ 保持 | Instinct 架构已适配 Antigravity KI |
| `/main_build` §7 门禁 | ✅ 保持 | 验证门禁 + 文件管理强于 ECC |
| `/main_ship` | ✅ 保持 | Docker + K8s + Terraform 完整 |
| `/main_ui` | ✅ 保持 | Hub + Theme + Anime.js 完整 |
| 10 个专业工程师 Skill | ✅ 保持 | 每个都有实质内容 (6-14KB) |
| 4 层架构 (L1-L4) | ✅ 保持 | 比 ECC 扁平结构更适合企业项目 |
| 加载纪律 (≤30KB/次) | ✅ 保持 | ECC 也强调上下文管理 |

---

## 六、预期成果

| 指标 | 当前 | 目标 |
|------|------|------|
| 工程师编码后自检 | ❌ 无 | ✅ 每次编码后执行 |
| 全局强制规则 | ❌ 散布在 Skill 中 | ✅ 独立 `rules/` 目录 |
| agent-mastery.md 大小 | 18.9KB | ≤12KB |
| 架构文档一致性 | ⚠️ README 与实际不一致 | ✅ 100% 一致 |
| TDD Bug 修复流程 | ❌ 只有 TDD 概念 | ✅ 有专用 RED→GREEN 流程 |
| 反模式清单 | ❌ 无 | ✅ 后端 + 前端各一份 |
| L4 过时文件 | ⚠️ V2 参考仍在 | ✅ 归档标注 |

---

## 七、风险与注意事项

| 风险 | 缓解 |
|------|------|
| 过度工程化 | 只做 P0 + P1，P2/P3 按需 |
| 文件膨胀 | 严格遵循 30KB 加载上限，拆分大文件 |
| 与 ECC 过度对齐 | ECC 面向个人开发者，我们面向企业团队，保持差异化 |
| 迁移成本 | Rules 层是新增，不修改现有 Skill 核心逻辑 |

---

**请确认：**
- ✅ 理解正确，按 Phase 1 → 2 → 3 顺序执行
- ❌ 需要修改 → 告诉我哪里不对
