# ECC v1.5.0 详细参考: 6 语言 Rules + Hooks + 28 Skills + 30 Commands

> **加载时机**: 需要了解 ECC 的强制规则系统 或 Hook 自动化时

## 1. Rules 系统 (强制规则)

### 目录结构
```
rules/
├── common/             # 语言无关
│   ├── coding-style.md
│   ├── git-workflow.md
│   ├── testing.md
│   └── security.md
├── typescript/         # TypeScript 特定
│   └── coding-standards.md
├── python/             # Python 特定
│   └── coding-standards.md
├── golang/             # Go 特定
│   └── coding-standards.md
├── java/               # Java + Spring Boot (v1.5.0)
│   └── coding-standards.md
├── django/             # Django (v1.2.0+)
│   └── coding-standards.md
└── springboot/         # Spring Boot 专用 (v1.2.0+)
    └── coding-standards.md
```

> ✅ 按需安装: `npx ecc-install typescript` / `npx ecc-install python` / `npx ecc-install java`

### coding-style.md 核心规则
```
不可变性 (CRITICAL):
  WRONG:  modify(original, field, value)  → 原地修改
  CORRECT: update(original, field, value) → 返回新副本

文件组织:
  - 高内聚低耦合
  - 单文件 200-400 行 (典型), 800 行上限
  - 从大模块提取工具函数
  - 按功能/领域组织, 非按类型

错误处理:
  - 每层显式处理错误
  - UI 层给用户友好消息
  - 服务端记录详细上下文
  - 永远不静默吞掉错误

输入验证:
  - 所有外部输入在边界验证
  - 使用 schema 验证 (Zod/class-validator)
  - 独立验证函数, 非内联检查
```

### testing.md 核心规则
```
最低覆盖率: 80%

三种测试 (全部必需):
  1. Unit Tests — 单个函数/组件
  2. Integration Tests — API 端点/数据库操作
  3. E2E Tests — 关键用户流

TDD 强制流程:
  1. 先写测试 (RED)
  2. 运行 → 应该失败
  3. 写最小实现 (GREEN)
  4. 运行 → 应该通过
  5. 重构 (IMPROVE)
  6. 验证覆盖率 (80%+)
```

## 2. Hooks 系统 (事件自动化)

### Hook 触发点
| Hook | 触发时机 | 用途 |
|------|---------|------|
| `PreToolUse` | Agent 调用工具前 | 拦截危险操作 |
| `PostToolUse` | Agent 完成工具调用后 | 自动检查结果 |
| `Stop` | Agent 完成任务时 | 最终验证 |

### 典型 Hook 实现
```javascript
// PreToolUse: 阻止删除生产数据库文件
export default function preToolUse(event) {
  if (event.tool === 'file_delete') {
    const path = event.params.path;
    if (path.includes('migration') || path.includes('production')) {
      return { blocked: true, reason: '禁止删除迁移/生产文件' };
    }
  }
}

// PostToolUse: 每次写文件后自动检查编译
export default function postToolUse(event) {
  if (event.tool === 'file_write' && event.params.path.endsWith('.ts')) {
    return { action: 'run', command: 'npx tsc --noEmit' };
  }
}
```

## 3. 验证循环 (6 阶段)

| 阶段 | 内容 | 命令 | 失败时 |
|------|------|------|-------|
| 1. 构建 | 编译通过 | `npm run build` | STOP, 必须修复 |
| 2. 类型 | 类型检查 | `npx tsc --noEmit` | 修复关键项 |
| 3. Lint | 代码规范 | `npm run lint` | 修复所有 |
| 4. 测试 | 全量测试 | `npm test` | 修复失败项 |
| 5. 覆盖率 | ≥80% | `npm test -- --coverage` | 补充测试 |
| 6. 安全 | 漏洞扫描 | `npm audit` | 修复高危 |

**关键原则**: 阶段 1 失败就 STOP, 不继续后续阶段。

## 4. 上下文管理

### Context Window 规则
- 配置 20-30 个 MCP, 但每项目启用 <10 个
- 活跃工具 <80 个
- 用 `disabledMcpServers` 在项目配置中禁用不用的

### 渐进检索 (4 阶段)
```
1. 先搜索 → 不直接打开文件
2. 搜索结果 → 只打开相关文件
3. 打开文件 → 只看需要的部分
4. 用完 → 释放上下文
```

## 5. 28 Skills 概览 (v1.5.0)

| 语言/领域 | Skills | 典型内容 |
|-----------|--------|--------|
| TypeScript | patterns, security, tdd, verification | React/Next.js 模式 |
| Python | patterns, security, tdd, verification | Django 安全 + TDD |
| Go | patterns, security, tdd, verification | Go 并发模式 |
| Java | patterns, security, tdd, verification | Spring Boot 架构 |
| 通用 | continuous-learning-v2, configure-ecc | Instinct 进化 |
| 审计 | agentshield, security-scan | 安全扫描 |

## 6. 30 Commands 概览 (v1.5.0)

| 分类 | 命令 | 说明 |
|------|------|------|
| 核心 | /plan, /review, /test, /debug | 基础工作流 |
| TDD | /tdd-start, /tdd-verify | 红绿重构 |
| Git | /commit, /pr, /changelog | 版本管理 |
| 安全 | /security-scan, /audit | 漏洞检测 |
| 多代理 | /pm2, /multi-plan, /multi-execute | PM2 编排 |
| 多服务 | /multi-backend, /multi-frontend, /multi-workflow | 前后端协同 |
| 学习 | /instinct-status, /instinct-import, /evolve | Instinct 进化 |
| 配置 | /sessions, /configure-ecc | 会话管理 |
| Skill | /skill-create | 从仓库生成 Skill |
