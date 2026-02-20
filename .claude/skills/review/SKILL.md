---

name: review
description: "代码审查 — 自动注入 git diff，按严重级分类"
---


你正在为 MGMT ERP 执行代码审查。**这是只读审查，不做修复。需要修复请用 `/guard`。纯验证请用 `/qa-gate`。**

## 加载

1. `.claude/core/rules/common.md` §0（范围纪律）+ §1（代码风格）+ §6（跨文件影响）
2. `.claude/projects/mgmt/reference/iron-laws.md` — 只读 R0-R2

根据变更文件类型加载对应规则:
- `.kt` / `.kts` 文件 → 同时读 `.claude/core/rules/backend.md`
- `.ts` / `.tsx` 文件 → 同时读 `.claude/core/rules/frontend.md`

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 当前变更

!`git diff --stat`
!`git diff | head -c 15000`

## 审查协议

1. `git diff --staged` + `git diff` 查看所有变更
2. 识别变更文件 → 关联功能 → 理解文件间连接
3. 读变更周围的上下文代码（禁止孤立审查，读完整文件）
4. 按 CRITICAL → LOW 顺序过下方审查清单
5. 只报告 **>80% 确信**是真问题的发现（置信度过滤）
6. 合并同类问题（如 "5 个函数缺错误处理" 而非 5 条独立发现）
7. 跳过：纯风格偏好（除非违反 `rules/` 层强制规则）
8. 跳过：未变更代码中的问题（除非是 CRITICAL 安全问题）
9. 优先：可能导致 bug / 安全漏洞 / 数据丢失的问题

---

## 审查清单

### CRITICAL — 安全 (发现即 Block)

| # | 检查项 | 识别方式 |
|---|--------|---------|
| S1 | 硬编码凭据 (API key/密码/token/secret) | grep 搜索 `password\|secret\|api.key\|token` 的赋值 |
| S2 | SQL 注入 (字符串拼接构造查询) | 检查 Repository 层非参数化查询 |
| S3 | XSS (未转义用户输入渲染到 HTML) | 检查 `dangerouslySetInnerHTML` + 模板字面量 |
| S4 | 路径穿越 (用户控制的文件路径未清理) | 检查文件操作中的用户输入 |
| S5 | CSRF (无保护的状态变更端点) | 检查 POST/PUT/DELETE 端点 CSRF 保护 |
| S6 | 认证绕过 (受保护路由缺 Auth Guard) | 检查新 Controller/Route 的权限注解/中间件 |
| S7 | 日志泄密 (记录了 token/密码/PII) | 检查 log/print/console 语句内容 |
| S8 | 不安全依赖 (已知漏洞的新增包) | 检查新增依赖版本 |

> 完整安全规则 → `rules/common.md` §4

### HIGH — 代码质量

| # | 检查项 | 阈值/标准 |
|---|--------|----------|
| Q1 | 大函数 | >50 行 → 拆分子函数 |
| Q2 | 大文件 | >600 行 → 按功能拆分 |
| Q3 | 深嵌套 | >4 层 → 早返回/提取函数 |
| Q4 | 缺失错误处理 | 未处理 Promise / 空 catch / 无 try-catch |
| Q5 | 可变状态模式 | 原地修改而非返回新副本 |
| Q6 | 残留 console.log / debug 语句 | 调试用的 → 合并前删除 |
| Q7 | 缺失测试 | 新代码路径/分支无测试覆盖 |
| Q8 | 死代码 | 注释代码 / 未使用 import / 未引用变量 |

> 完整代码风格 → `rules/common.md` §1

### HIGH — React/Next.js (仅 .ts/.tsx 变更时检查)

| # | 检查项 | 问题 |
|---|--------|------|
| R1 | useEffect/useMemo 依赖数组不完整 | 过期数据 / 无限循环 |
| R2 | render 中直接调 setState | 无限渲染循环 |
| R3 | 列表用 index 做 key | DOM 复用错误 / 状态混乱 |
| R4 | Prop 穿透 >3 层 | 可维护性差 → 用 Context |
| R5 | Server Component 使用 useState/useEffect | 构建失败 |
| R6 | 缺少 Loading/Error/Empty 三态 | 空白页面 / 用户困惑 |
| R7 | 过期闭包 (事件处理器捕获过期 state) | 操作基于旧数据 |

> 完整前端反模式 → `rules/frontend.md` §2 (F1-F11)

### HIGH — 后端 (仅 .kt/.kts 变更时检查)

| # | 检查项 | 问题 |
|---|--------|------|
| K1 | 输入未验证 (DTO 缺 @Valid/@NotBlank) | 脏数据入库 |
| K2 | N+1 查询 (循环中查关联数据) | 性能灾难 |
| K3 | 无界查询 (findAll 无分页) | OOM 风险 |
| K4 | 外部 HTTP 调用无 timeout | 线程池阻塞 |
| K5 | 错误信息泄露 (内部异常直接返客户端) | 信息泄漏 |
| K6 | 事务注解缺失 / 事务在 private 方法上 | 数据不一致 |
| K7 | 同步 I/O 在协程/异步上下文中 | 线程池饥饿 |

> 完整后端反模式 → `rules/backend.md` §2 (B1-B11)

### MEDIUM — 性能

| # | 检查项 | 识别方式 |
|---|--------|---------|
| P1 | 低效算法 (O(n²) 可优化为 O(n log n)) | 嵌套循环 / 重复搜索 |
| P2 | 不必要重渲染 | 缺失 memo / 内联对象或函数作为 prop |
| P3 | 大 bundle (整包导入) | `import lib` 而非 `import { fn } from lib` |
| P4 | 缺失缓存 (重复计算/重复请求) | 高频调用无缓存层 |
| P5 | 未优化图片 | 未用 `next/image` / 未压缩 |
| P6 | 同步 I/O 在异步上下文 | 阻塞事件循环 / 阻塞协程调度器 |

### LOW — 风格 (记录但不阻塞)

命名不清晰、注释过多/过少、格式不一致 → 记录建议，不阻塞合并。

---

## 输出格式

### 每个发现

```
## [FILE_PATH]

### CRITICAL: [Issue Title]
**Line**: [number]
**Issue**: [description]
**Fix**: [suggested fix]
```

### 审查总结 (必须包含)

```
## Review Summary

| 严重级 | 数量 | 状态 |
|--------|------|------|
| CRITICAL | 0 | PASS |
| HIGH | 2 | WARN |
| MEDIUM | 3 | INFO |
| LOW | 1 | NOTE |

Verdict: APPROVE / WARNING / BLOCK
```

### 判定前 Think 检查点

> 🧠 **THINK (`rules/common.md` §12)**: 输出 Verdict 前必须推理 — 所有变更文件都审查了吗? 有跨文件影响遗漏吗? 判定置信度 >80%?

### 判定标准

| 结果 | 条件 |
|------|------|
| **APPROVE** | 零 CRITICAL, 零 HIGH |
| **WARNING** | 仅 HIGH (无 CRITICAL) — 列出项 + 修复建议 |
| **BLOCK** | 有 CRITICAL — 必须修复，列出所有 CRITICAL 项 |

## 任务

$ARGUMENTS
