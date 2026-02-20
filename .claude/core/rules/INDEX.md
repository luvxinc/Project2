# Rules 真相源索引

> 本页是规则唯一入口。所有 workflow/skill 仅引用本页与对应节号，不重复正文。

## 规则文件

- `common.md`
  - §1 代码风格
  - §2 Git 纪律
  - §5 验证循环（6阶段）+ §5.2 循环触发规则 + §5.3 集成测试规则 + §5.4 PASS 退出条件
  - §6 跨文件影响分析
  - §9 代码拆分与复用
  - §12 Think Discipline — 行动前链式推理
  - §13 Token-Efficient Execution — 代码编排优先
  - §14 问题复盘铁律
  - §15 性能意识（算法复杂度 + Token 预算 + 内存）
  - §16 设计模式优先（内置模式 > 自造轮子）
- `frontend.md`
  - 前端反模式 (F1-F11) + CRITICAL/HIGH Checklist + 性能红线
- `backend.md`
  - 后端反模式 (B1-B11) + CRITICAL/HIGH Checklist + 性能红线 + 缓存策略

## 使用约定

1. 规则条款变更只改 `rules/*.md`
2. workflow/skills 禁止复制整段规则正文
3. 引用格式：`core/rules/common.md` §N
