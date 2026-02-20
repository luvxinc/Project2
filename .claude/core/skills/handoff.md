---
name: handoff
description: 会话交接协议 SOP。Use when 长任务跨会话接力、需要检查点保存/恢复与上下文压缩传递。
---

# 会话交接协议 (Session Handoff Protocol)

---

## 1. 触发时机

| 信号 | 行动 |
|------|------|
| 上下文 > 70% | 准备检查点 |
| 上下文 > 85% | 立即保存，结束会话 |
| 任务预计步骤 > 10 | 提前规划切分点（Spec 阶段） |
| Agent 开始重复/遗忘 | 立即保存，结束会话 |
| 用户说"先到这里" | 保存检查点 |

---

## 2. 检查点

格式 → `core/templates/checkpoint-template.md`（含标准模式和紧急模式）

存储：`.claude/projects/{project}/data/checkpoints/YYYY-MM-DD_{task-name}_checkpoint.md`
命名规则：`core/skills/project-structure.md` §3.6 + §4

---

## 3. 恢复流程

新会话收到"继续上次"时：
1. 读最新检查点
2. 读检查点中列出的相关文件
3. 读对应 Spec 文件
4. 向用户确认："上次做到 Step N，我从这里继续？"
5. 验证 `git status`（代码可能被手动改过）
6. 恢复执行

恢复铁律：读完检查点先确认再继续；重读 Spec，不依赖上下文记忆。

---

## 4. 主动切分（长任务）

预估 > 10 步的任务在 Spec 阶段主动规划切分点，格式：

```
### Session 1: {阶段名}
- [ ] Step 1: ...
- [ ] Step 2: ...
📌 切分点 — 保存检查点
```

---

## 5. 与全局工作流的关系

检查点保存不改变任务状态。恢复后从当前状态继续流转。
状态机定义：`workflows/build.md` §0

---

*Version: 2.0.0 — Phase 1 瘦身 (格式外迁 + 紧急模式合并入模板)*
*Updated: 2026-02-19*
