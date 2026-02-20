# 实施方案: VMA 模块

> **L1 通用 SOP → MGMT VMA 的项目实施指南**
> **当前阶段: Phase 6.9 (多岗位数据模型重构)**

---

## 1. VMA 是什么

VMA (Valve Management & Audit) 是 MGMT ERP 中最复杂的模块, 包含 5 个子模块:

| 子模块 | 职责 | 复杂度 |
|--------|------|--------|
| **Employees** | 员工 CRUD + 部门 + 岗位 (多对多) | ★★★ |
| **Training** | SOP 版本控制 + 培训记录 + 合规路线图 | ★★★★ |
| **P-Valve Inventory** | P-Valve 库存跟踪 (1 unit/serial) | ★★ |
| **Delivery System** | Delivery System 库存 (多 units/serial) | ★★ |
| **Clinical Case** | 临床案例 (关联 P-Valve + DS) | ★★★ |
| **Demo Inventory** | Demo 产品跟踪 (过期/拒收/手动移入) | ★★ |

---

## 2. 用 L1 通用 SOP的方式

### backend.md → VMA 后端

| L1 泛化 | VMA 具体用法 |
|---------|-------------|
| DDD 分层 | V2 暂用简化版 (Controller → Service → Prisma); V3 迁移后用完整 DDD |
| Spring Modulith | V3: `com.mgmt.erp.modules.vma.{employees,training,inventory,clinical}` |
| 事务管理 | 库存移动 (入库/出库/Demo 移转) 必须原子操作 |
| DTO 验证 | 员工: 姓名/部门必填; 库存: 序列号唯一性校验 |

**V2 当前技术 (NestJS)**:
```
apps/api/src/modules/vma/
├── vma.module.ts              # 根模块 (imports 子模块)
├── employees/
│   ├── employees.controller.ts
│   └── employees.service.ts
├── training/
│   ├── training.controller.ts
│   └── training.service.ts
├── inventory/
│   ├── inventory.controller.ts
│   └── inventory.service.ts
└── clinical-case/
    ├── clinical-case.controller.ts
    └── clinical-case.service.ts
```

### frontend.md → VMA 前端

| L1 泛化 | VMA 具体用法 |
|---------|-------------|
| Hub 页面 | VMA Hub = 4-tab iPad 风格 (Employees / Dept & Duties / Training SOP / Training) |
| 页面路由 | `app/(dashboard)/vma/` |
| Pill 切换 | VMA 内部用 pill-style tabs (非标准 route 切换) |
| i18n | namespace = `vma` |
| Modal | 员工编辑/SOP 新增/培训记录 都用 `<Modal>` |

**路由结构**:
```
/vma                    → VMA Hub (4 tabs)
/vma/p-valve            → P-Valve Hub (pills 切换)
/vma/p-valve/inventory  → P-Valve 库存
/vma/p-valve/delivery   → Delivery System 库存
/vma/p-valve/clinical   → 临床案例
/vma/p-valve/demo       → Demo 库存
```

### data.md → VMA 数据

| L1 泛化 | VMA 具体用法 |
|---------|-------------|
| PostgreSQL Schema | Prisma schema 分文件: `vma_employees.prisma`, `vma_training.prisma`, `vma_pvalve_inventory.prisma` |
| 关系模型 | 员工↔岗位 = 多对多 (Phase 6.9 重构中) |
| 审计字段 | 所有 VMA 表必须有 `createdAt/updatedAt/createdBy/updatedBy` |
| 唯一约束 | P-Valve: serial number 唯一; 员工: employee_code 唯一 |

---

## 3. VMA 专属业务规则

| 规则 | 说明 |
|------|------|
| **SOP 版本培训** | SOP 每次版本变更 → 所有关联员工需要重新培训 |
| **培训基线** | 新员工只培训入职日期之前存在的 SOP 版本 |
| **Demo 状态** | 4 种: Expired / Rejected(Receiving) / Rejected(Case) / Manually Moved |
| **临床绑定** | 每个临床案例 = 1 P-Valve + 1 Delivery System |
| **多岗位** | 一个员工可以有多个岗位, 一个岗位可以有多个员工 (Phase 6.9) |

---

## 4. 当前焦点: Phase 6.9

### 多岗位重构 (多对多关系)

**旧模型** (一对多):
```
Employee → belongsTo → Duty
```

**新模型** (多对多):
```
Employee ←→ EmployeeDuty (中间表) ←→ Duty
```

**需要改的**:
1. Prisma Schema: 新增 `EmployeeDuty` 中间表
2. 后端 Service: 员工 CRUD 支持多岗位分配
3. 前端: 员工编辑弹窗 → 多选岗位 (checkbox/multi-select)
4. 培训逻辑: SOP 与多个 Duty 关联, 员工通过 Duty 关联 SOP

---

## 5. 接下来: Phase 6.10-6.11

| 子阶段 | 任务 | 引用实施方案/通用 SOP |
|--------|------|---------------|
| 6.10 | VMA 后端拆分为 NestJS 子模块 | `L1 backend.md` §模块结构 |
| 6.11 | 前端 React Query 集成 | `L1 frontend.md` §API Client |

---

*VMA Recipe v1.0 — 2026-02-11*
