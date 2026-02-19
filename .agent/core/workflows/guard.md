---
description: /main_guard 工作流。Use when 需要 TDD、代码审查、安全审计、故障排查或事故响应。
---

# /guard — 守

> 输出报告必须使用：`core/templates/guard-check-report-template.md`（固定结构：Scope/需求对照/反猜测/结论/证据）

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **本文件是编排层 — 引用 L1 SOP, 不重复其内容。**
> 🔴 **Token 节约铁律:** SOP 只读命中 section; 域索引先读; L3 工具先读 INDEX; 大文件用完释放; 单次 ≤30KB。

---

## 🔴 V3 架构合规 (Architecture Reference — 强制)

> **所有审查/排查任务, 必须以 V3 架构规范为基准:**
> - 📐 主文件: `.agent/projects/mgmt/reference/v3-architecture.md`
> - 📚 参考规范: `.agent/projects/mgmt/reference/*.md` (24 个)
> - 📋 质量基准: `.agent/projects/mgmt/data/audits/v3-deep-quality-audit.md`
>
> **代码审查/安全审计时, 必须验证代码符合 V3 DDD 分层、API 规范、安全等级模型。不合规 = Block。**

---

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `TDD`, `测试`, `红绿`, `覆盖率` | → §1 TDD 流程 |
| `审查`, `review`, `PR`, `代码质量` | → §2 代码审查 |
| `安全`, `漏洞`, `渗透`, `权限` | → §3 安全审查 |
| `构建`, `编译`, `build`, `依赖` | → §4 构建错误修复 |
| `排查`, `debug`, `故障`, `日志` | → §5 故障排查 |
| `事故`, `incident`, `回滚`, `P0` | → §6 事故响应 |
| `死循环`, `卡死`, `timeout`, `hang` | → §7 反死循环与终端防卡死 |

---

## §1 TDD 流程

> **加载:** `skills/backend.md` §6 (JUnit + Testcontainers), `skills/agent-mastery.md` §1 (验证循环)

### RED → GREEN → REFACTOR

```
1. RED:    先写测试 → 运行 → 必须失败
2. GREEN:  写最小实现 → 运行 → 必须通过
3. REFACTOR: 清理代码 → 运行 → 仍然通过
4. COVERAGE: 检查覆盖率 ≥ 80%
```

### 测试类型 (全部必需)

| 类型 | 工具 | 覆盖目标 |
|------|------|---------|
| 单元测试 | JUnit 5 / Vitest | 单个函数/组件 |
| 集成测试 | Testcontainers / Supertest | API 端点/数据库操作 |
| E2E 测试 | Playwright / Cypress | 关键用户流 |

### L3 参考
- 详见 `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 (TDD 强制规则)

---

## §2 代码审查

> **加载:** `skills/qa-auditor.md` §2 (审计清单), `skills/chief-engineer.md` §5 (整合验证)

### 审查流程

```
1. git diff --staged + git diff 查看所有变更
2. 识别变更文件 → 关联功能 → 理解连接
3. 读周围代码 (不孤立审查, 读完整文件)
4. 按 CRITICAL → LOW 顺序过清单
5. 只报告 >80% 确信是真问题的发现
```

### 分级审查

| 级别 | 检查内容 |
|------|---------|
| 🔴 CRITICAL | 安全漏洞 (注入/XSS/CSRF/凭据泄露) |
| 🟠 HIGH | 代码质量 (长函数/深嵌套/缺错误处理/死代码) |
| 🟡 MEDIUM | 性能 (低效算法/不必要重渲染/缺缓存) |
| 🟢 LOW | 风格 (命名/注释/格式) |

### L3 参考
- 完整审查清单: `warehouse/tools/everything-claude-code/01-agents-review.md` §3

---

## §3 安全审查

> **加载:** `skills/security.md` §2-§7 (全方位安全)

### 安全检查清单

```
认证:
  [ ] OAuth2/JWT 实现正确
  [ ] Token 过期 + 刷新
  [ ] 密码哈希 (bcrypt)
  [ ] 多因子认证 (如适用)

授权:
  [ ] RBAC 权限矩阵覆盖所有端点
  [ ] L1-L4 安全级别正确
  [ ] 无权限绕过

输入/输出:
  [ ] 参数化查询 (无 SQL 注入)
  [ ] 输入验证 (schema 校验)
  [ ] 输出编码 (无 XSS)
  [ ] 无日志泄密 (无 token/密码/PII)

基础设施:
  [ ] HTTPS only
  [ ] CORS 配置正确
  [ ] CSRF 保护
  [ ] 速率限制
```

### L3 参考
- 安全反模式: `warehouse/tools/everything-claude-code/01-agents-review.md` §3 (CRITICAL 清单)
- 编码规范: `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 (输入验证)

---

## §4 构建错误修复

> **加载:** `skills/agent-mastery.md` §1 (验证循环), 对应工程师 SOP

### 修复流程

```
1. 读取完整错误信息 (不要截断)
2. 搜索相关文件和依赖
3. 定位根因 (不要修表面症状)
4. 修复 → 验证 (6 阶段验证循环)
5. 确认无回归
6. 🔴 问题复盘铁律:
   a. 记录错题本: 写入 `.agent/projects/{project}/data/errors/ERROR-BOOK.md` (`core/skills/memory.md` §3.2 格式)
   b. 交叉检查: 抽象错误模式 → grep 搜索同类代码 → 一并修复 → 记录 (`core/skills/memory.md` §3.5)

验证循环:
  Build → Types → Lint → Tests → Security → Diff
  阶段 1 失败就 STOP, 不继续后续。
```

### 常见构建错误

| 错误类型 | 排查方向 |
|---------|---------|
| 类型错误 | 检查 DTO 定义/接口变更 |
| 导入失败 | 检查路径/包版本/exports |
| 循环依赖 | 提取到公共模块 |
| 版本冲突 | `pnpm why` / `./gradlew dependencies` |

---

## §5 故障排查

> **加载:** `skills/observability.md` §2-§4 (日志/追踪), `skills/agent-mastery.md` §5 (错误处理)

### 排查流程

```
1. 复现: 确认问题存在 + 收集条件
2. 日志: 查看结构化日志 (Loki/console)
3. 追踪: 从入口追踪请求链路
4. 缩小: 二分法定位问题代码
5. 修复: 修改 + 验证 + 补测试 (防回归)
6. 🔴 问题复盘铁律 (必须执行, 不可跳过):
   a. 记录错题本: 写入 `.agent/projects/{project}/data/errors/ERROR-BOOK.md` (`core/skills/memory.md` §3.2 格式)
   b. 交叉检查: 抽象错误模式 → grep 搜索同类代码 → 逐一检查 → 批量修复 → 记录 (`core/skills/memory.md` §3.5)

关键规则:
  - 不要猜, 用日志和数据说话
  - 先理解, 再修复
  - 修复后补测试 (防回归)
```

### 错题本 (永久学习)
- 修复后必须记录到 `.agent/projects/{project}/data/errors/ERROR-BOOK.md`
- 必须执行交叉检查 (`core/skills/memory.md` §3.5) 确认无同类问题残留
- 详见 `skills/memory.md` §3

---

## §6 事故响应

> **加载:** `skills/observability.md` §8 (SRE 实践)

### 事故等级

| 等级 | 影响 | 响应时间 |
|------|------|---------|
| P0 | 全站不可用 | 立即 |
| P1 | 核心功能失效 | 15 分钟 |
| P2 | 非核心功能异常 | 1 小时 |
| P3 | 小问题/降级 | 下一工作日 |

### 响应流程

```
1. 稳定: 回滚到已知良好版本 (优先恢复服务)
2. 通知: 告知相关方 (PM → 用户)
3. 诊断: 根因分析 (5 Whys)
4. 修复: 永久修复 + 部署
5. 复盘: 事故报告 → 存 audits/
6. 🔴 问题复盘铁律:
   a. 记录错题本: 写入 `.agent/projects/{project}/data/errors/ERROR-BOOK.md` (`core/skills/memory.md` §3.2 格式)
   b. 交叉检查: 抽象事故模式 → grep 搜索同类危险点 → 一并修复 → 记录 (`core/skills/memory.md` §3.5)
```

---

## §7 反死循环与终端防卡死（LOOP_BREAK）

触发条件（任一满足即触发）：
- 同策略指纹失败达到 2 次后仍要重复同法
- 连续失败 3 次
- 10 分钟无净进展
- 终端命令 60 秒无输出且无明确长任务标识

触发后必须执行：
1. 停止当前重复路径
2. 输出 `LOOP_BREAK` 四件套：
   - 已证伪方案
   - 最小可复现
   - 三个替代路径（含风险）
   - 选择下一路径理由
3. 终端命令切换到安全执行：`core/scripts/safe-exec.sh`

终端执行硬规则：
- 默认超时：短命令 90s，重命令 600s（需显式声明）
- 同命令同参数最多 2 次
- 无界扫描命令必须加范围/limit

---

## §8 L3 工具库引用

| 环节 | 推荐工具 | 路径 | 何时加载 |
|------|---------|------|---------| 
| §2 代码审查 | ECC: Code Reviewer | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | CRITICAL→LOW 审查清单 |
| §3 安全审查 | ECC: Security | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | 8 项安全检查 |
| §1 TDD / §4 构建 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | TDD 规则 + 验证循环 |
| §5 前端排查 | UI UX Pro | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` | UX 反模式检查 |
| §2/§3 提交前 | 🔴 Rules 层 | `core/rules/common.md` + `core/skills/frontend.md` / `core/skills/backend.md` | **必查** — 反模式 + 自检 Checklist |

---

## §9 文档门禁闭环（Agent 链路）

交付前必须执行文档门禁：
- 运行：`core/scripts/agent-doc-audit.sh .agent`
- 判定：Hard missing references 必须为 0
- Soft placeholders 允许存在，但要在审计报告中注明数量与原因
- 依据：`core/reference/agent-doc-gate-standard.md`

## §10 交接闭环

每个 Guard 任务必须以下列之一结束:

| 结果 | 交接对象 | 行动 |
|------|----------|------|
| ✅ 全部通过 | CTO / PM | 输出审查报告: “无问题, 可继续” |
| ⚠️ 发现问题 | CTO | 输出问题清单 + 修复建议 → CTO 分配修复 |
| 🔴 严重事故 | PM + CTO | 触发 §6 事故响应 → 并行通知 |

```markdown
## Guard 完成报告
任务: {TDD/代码审查/安全审查/构建错误/前端排查/事故响应}
结果: {✅ 通过 / ⚠️ 发现 N 个问题 / 🔴 事故}
交接: {CTO/PM}
下一步: {无 / 修复清单 / 事故响应流程}
```

---

*Version: 2.1.0 — +§8 交接闭环*
*Created: 2026-02-14 | Updated: 2026-02-15*
