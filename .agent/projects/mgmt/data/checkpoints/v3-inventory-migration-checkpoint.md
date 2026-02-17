# V3 库存模块迁移 — 进度检查点

> **最后更新**: 2026-02-17 03:52 PST  
> **状态**: ⏸️ 暂停 (用户决定先做全表审计)

---

## 已完成工作

### ✅ Phase 1: V1 数据库审计
- **v1-database-deep-audit.md** — 28 张 V1 表的代码级全链路追踪
- 识别了 12 张冗余 `_final` 表 (42% 表数)
- 识别了 3 个结构性反模式 (EAV, 动态列, 类型松散)
- 完整的写入路径/读取路径/字段分析

### ✅ Phase 2: V3 Schema 设计
- **V3__inventory_module.sql** — 完整的 Flyway DDL (752 行)
  - 17 个正规化 PostgreSQL 表 + 1 个物化视图
  - 自定义 ENUM 类型
  - 完整的 FK 约束 + 部分索引
  - 审计字段 + 软删除
  - 通过 `psql` dry-run 语法验证

### ✅ Phase 3: 映射文档
- **v3-inventory-schema-mapping.md** — V1→V3 逐表对照
  - 表数量汇总 (28→17, 减少 33%)
  - 字段类型升级清单
  - 索引策略
  - 数据迁移转换规则
  - FIFO 约束验证规则

---

## 未完成工作

### ❌ Phase 4: Integration Tests (Testcontainers)
- 未开始

### ❌ Phase 5: Data Migration Scripts
- 未开始
- 需要按依赖顺序迁移:
  1. Supplier + Strategy
  2. PO + Strategy
  3. Send (三表→两表)
  4. Receive + Diff (四表→一表)
  5. Payment (八表→一表)
  6. FIFO (三表1:1 + landed_price合并)
  7. Data_Inventory (列→行)
  8. Data_Transaction (EAV→行)

### ❌ Phase 6: Triple-Audit Verification
- 未开始

---

## 关键文件位置

| 文件 | 路径 |
|------|------|
| V3 DDL | `mgmt-v3/src/main/resources/db/migration/V3__inventory_module.sql` |
| V1→V3 映射 | `.agent/projects/mgmt/data/audits/v3-inventory-schema-mapping.md` |
| V1 深度审计 | `.agent/projects/mgmt/data/audits/v1-database-deep-audit.md` |
| V3 架构参考 | `.agent/projects/mgmt/reference/v3-architecture.md` |
| V1 深度参考 | `.agent/projects/mgmt/reference/v1-deep-dive.md` |

---

## 恢复指南

下次继续时:
1. 读取此 checkpoint 获取上下文
2. 读取 `v3-inventory-schema-mapping.md` 获取 V1→V3 映射关系
3. 从 Phase 4 (Integration Tests) 开始
4. 先验证 DDL 语法 (`psql -f V3__inventory_module.sql`)
5. 然后编写 Testcontainers 集成测试

---

## 已知风险

1. **`Data_Order_Earning` 表未在 V3 DDL 中覆盖** — 需要评估是否需要迁移
2. **异常处理 4 策略** 涉及多表级联修改 — 迁移后需仔细验证
3. **Trigger 同步机制** (V1 MySQL trigger → V3 change_history) — 需要测试
4. **in_pmt_logistic** 的 trigger 删除机制 — V3 用 soft delete 替代

*Checkpoint Created: 2026-02-17T03:52:00-08:00*
