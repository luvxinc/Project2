---
name: continuous-learning
description: 持续学习协议。Use when 任务关闭时回顾可复用模式，或用户纠正时记录经验。
---

# 持续学习协议 (v2.0)

## 学习时机

- **任务关闭时**：回顾本次会话有哪些模式值得沉淀
- **用户纠正时**：立即按 `memory.md` §3.5 分类记录

## 学习输出

| 类型 | 写入位置 |
|------|---------|
| 代码错误/Bug | `ERROR-BOOK.md` |
| 需求理解/UIUX 偏好 | `PROJECT-MEMORY.md` |
| 流程改进/SOP问题 | `data/training/{YYYY-MM-DD}_{topic}.md` |
| 通用工程模式（需 CTO 批准） | 对应 L1 Skill |

## 沉淀标准

- 同一模式出现 **2 次** → 记录
- 同一模式出现 **3+ 次** → 升级为 Skill 规则
- 用户说"记住这个" → 立即记录

## 模式检测类型

| 类型 | 触发 |
|------|------|
| `user_corrections` | 用户修正了做法 |
| `error_resolutions` | 解决了棘手 Bug |
| `repeated_workflows` | 同一流程 3+ 次 |
| `project_conventions` | 项目独特约定 |

---

*Version: 2.0.0 — Phase 1 重写 (删除本能模型/置信度/Antigravity适配，保留可执行核心)*
*Updated: 2026-02-19*
