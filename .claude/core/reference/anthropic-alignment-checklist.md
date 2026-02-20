# Anthropic Agent Skills 对齐清单（执行版）

> 目标：严格按 Anthropic Skills 定义治理 `.agent`。
> 参考：`warehouse/tools/anthropic-skills/01-spec-template.md`

## A. 触发与元数据

- [x] 每个核心 Skill 具备 frontmatter `name` + `description`
- [ ] `description` 统一改为“做什么 + 何时使用（触发词）”双句式
- [ ] 禁止在正文重复“when to use”长段，优先放入 description

## B. 渐进加载与上下文控制

- [x] 顶层索引路由存在（`core/SKILL.md`）
- [x] 路由 + 切片策略存在（domains/workflows/rules）
- [x] 预算约束存在（单次 ≤30KB、用完释放）
- [ ] 为高频 Skill 增加“最大建议加载片段数”字段（如 ≤2 sections）

## C. 单一职责与真相源

- [x] rules/workflows/skills 三层已建立索引入口
- [x] 去重方向已执行（PM/CTO/QA 改为引用真相源）
- [ ] 全量扫描“重复正文”并建立剩余清单

## D. 可执行资源（scripts/references）

- [x] 已有执行脚本（qa-gate/safe-exec/agent-doc-audit）
- [x] 已有参考层（`core/reference/*`）
- [ ] 对关键流程补 `scripts + reference` 绑定表（谁调用谁）

## E. 安全与失败模式

- [x] 反死循环规则（同策略≤2、LOOP_BREAK）
- [x] 终端安全执行（timeout + idle watchdog）
- [x] QA 模板包含反死循环记录
- [ ] 给失败输出统一 machine-readable 片段（便于自动聚合）

## F. 门禁

- [x] 文档门禁：Hard missing references = 0
- [x] QA 门禁：集成测试强制
- [ ] 新增“Anthropic 对齐门禁”脚本（检查 A/B/C 核心项）

---

## 本轮执行优先级（P1）

1. 统一 description 双句式（A）
2. 增加高频 Skill “最大加载片段数”约束（B）
3. 新增 anthropic-alignment-audit 脚本雏形（F）
4. QA 增强审计纳入 SAST/Secrets/SBOM/License（warn→enforce 两阶段）

## 验收标准

- A/B/F 的脚本检查可自动执行
- 关键结果可进入 QA 报告
- 不增加重复正文，不破坏现有路由
