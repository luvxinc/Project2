---
description: 守 — TDD, 代码审查, 安全审查, 构建错误, 故障排查, 事故响应
---

# /guard — 守

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **本文件是编排层 — 引用 L1 SOP, 不重复其内容。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `TDD`, `测试`, `红绿`, `覆盖率` | → §1 TDD 流程 |
| `审查`, `review`, `PR`, `代码质量` | → §2 代码审查 |
| `安全`, `漏洞`, `渗透`, `权限` | → §3 安全审查 |
| `构建`, `编译`, `build`, `依赖` | → §4 构建错误修复 |
| `排查`, `debug`, `故障`, `日志` | → §5 故障排查 |
| `事故`, `incident`, `回滚`, `P0` | → §6 事故响应 |

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
5. 修复: 修改 + 验证 + 写错题本

关键规则:
  - 不要猜, 用日志和数据说话
  - 先理解, 再修复
  - 修复后补测试 (防回归)
```

### 错题本 (永久学习)
- 修复后记录到 `projects/{project}/data/errors/ERROR-BOOK.md`
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
5. 复盘: 事故报告 → 存 audits/ + 更新错题本
```

---

## §7 L3 工具库引用

| 环节 | 推荐工具 | 路径 | 何时加载 |
|------|---------|------|---------| 
| §2 代码审查 | ECC: Code Reviewer | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | CRITICAL→LOW 审查清单 |
| §3 安全审查 | ECC: Security | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | 8 项安全检查 |
| §1 TDD / §4 构建 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | TDD 规则 + 验证循环 |
| §5 前端排查 | UI UX Pro | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` | UX 反模式检查 |
| §2/§3 提交前 | 🔴 Rules 层 | `core/rules/common.md` + `frontend.md` / `backend.md` | **必查** — 反模式 + 自检 Checklist |

---

## §8 交接闭环

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
