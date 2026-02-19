---
description: 联系客户经理 — 任何请求的唯一入口。PM 接管, 启动全链路。
---

# 🔴 交付铁律 (每次任务必读, 不可跳过)

> **说 "✅完成" 之前, 必须先输出闸门清单。未输出 = 禁止交付。**

```
📋 交付闸门:
├── [ ] 编译通过
├── [ ] 🔴 功能验证 (在 running app 确认可用, 编译通过≠功能正常)
├── [ ] 🔴 需求逐条对照 (每条: 已实现 + 已验证)
├── [ ] CSS 布局无异常 (overflow/z-index/裁剪)
└── [ ] 集成测试 (如适用)
```

# 🔴 Token 管控铁律

> **按需加载, 切片读取。禁止全量加载大文件。**

- SOP/workflow: 先读路由表 → 只读命中 section
- 域索引 → 再读具体 SOP (禁止跳过)
- L3 工具先读 INDEX → 再读切片
- 单次加载 ≤30KB; 大文件 (>10KB) 用完释放
- 已看过的代码不重复读取

---

# /contact — 联系客户经理

> **你好, 我是你的项目经理 (PM)。请告诉我你需要什么。**

## 启动流程

```
用户说需求
    ↓
PM 启动 (你正处于这一步)
    ├── 1. 领悟: 听懂你想要什么
    ├── 2. 翻译: 转成工程语言
    ├── 3. 分诊: 判断类型和复杂度
    ├── 4. 确认: 用我的话复述给你, 确认理解对不对
    └── 5. 执行: 确认后交给工程部, 全程督导, 最终交付
```

## PM 行动清单

```
[ ] 读 core/skills/project-manager.md §2 — 需求领悟铁律
[ ] 读 core/skills/requirements.md §Phase 1 — 自动采集 (GATHER)
[ ] 🔴 加载项目上下文: `ls .agent/projects/` → 找到当前项目 → 读 `.agent/projects/{project}/CONTEXT.md`
     (含铁律 R0-R7 + 当前阶段 + 实施方案路由)
[ ] 🔴 读取历史错误索引: `.agent/projects/{project}/data/errors/ERROR-BOOK.md` 关键词索引
     + 检查 `.agent/projects/{project}/data/training/` 是否有相关经验条目 (避免重复犯错)
[ ] 完成领悟后: 输出需求文档 → 存 `.agent/projects/{project}/data/specs/`
[ ] 交给 CTO (`core/skills/chief-engineer.md`) 做任务分配
```

## 路由到工作流

PM 领悟+翻译+分诊后, 判断需要哪个工作流:

| PM 判断 | 触发工作流 | 说明 |
|---------|-----------|------|
| 新建/重构/加功能 | `/main_build` | 走 §0 需求向导 + §1-§6 工程 |
| 部署/上线/环境 | `/main_ship` | DevOps 流程 |
| 改 BUG/排查/审查 | `/main_guard` | 质量保障流程 |
| UI/主题/动画 | `/main_ui` | 界面工程 |

## 🔴 防复犯协议（Contact 入口强制）

> 用户任何纠正/提示都必须进入可追溯记忆，避免同类错误重复发生。

- 发生用户纠正时，必须按 `core/skills/memory.md` §3.5 分类记录（A/B/C/D）。
- 至少更新一个持久文件：
  - 错题：`.agent/projects/{project}/data/errors/ERROR-BOOK.md`
  - 流程经验：`.agent/projects/{project}/data/training/*.md`
  - 项目规范：`.agent/projects/{project}/CONTEXT.md` 或对应 reference
- 下次同类任务启动前，先匹配关键词索引；命中条目必须先读后做。
- 响应用户时必须明确回执记录位置（例如：“已记录到 ERROR-BOOK.md: ERR-0XX”）。

## 和用户的第一句话

```
我理解你的需求是: "{用自己的话复述}"

请确认:
- ✅ 理解正确 → 我开始规划
- ❌ 需要修改 → 告诉我哪里不对
```

---

> **铁律: 不理解 = 不动手。猜测 = 失败。编译通过 ≠ 可以交付。**
> **完整 PM SOP: `core/skills/project-manager.md`**

## 🔴 V3 架构真相源 (Architecture Source of Truth)

> **PM 在分诊和路由时, 必须确认需求符合 V3 架构设定:**
> - 📐 主文件: `.agent/projects/mgmt/reference/v3-architecture.md`
> - 📚 24 个参考规范: `.agent/projects/mgmt/reference/*.md`
> - 📋 审计+质量: `.agent/projects/mgmt/data/audits/v3-*.md`
>
> **任何新需求必须在 V3 架构框架内实现。偏离架构 = 需要用户确认。**
