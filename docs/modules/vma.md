# VMA (Valve Management & Audit) Module

## 概述

VMA 是 MGMT ERP V2 系统的医疗器械管理模块，用于 P-Valve（心脏瓣膜）和 Delivery System（输送系统）的全生命周期追踪、培训合规管理和临床案例管理。

## 功能列表

### 核心功能
- **员工管理**: CRUD + 部门分配（多对多, 栈式编辑规则）
- **部门/职责管理**: Code + Duties 复合唯一, SOP 需求关联
- **培训 SOP 管理**: 版本控制 + Smart Fill 缺口分析
- **培训记录管理**: 批次培训 + PDF 生成
- **库存管理**: 收货 → 临床使用 → 退回/销毁 全流程
- **临床案例管理**: 产品分配(FEFO) → 完成/反转 → 自动库存调整
- **Demo 库存**: 手动移动 + 收货拒绝 + 案例拒绝 + 过期品自动归类
- **站点管理**: 多站点配置

### 辅助功能
- **PDF 生成**: 收货检验报告, 装箱单, 培训记录
- **Smart Fill**: 基于 SOP 需求自动分析培训缺口
- **库存总览**: 实时库存汇总 (Available/WIP/NearExp/Expired)

## API 端点

### 员工 (Employees)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/employees | 员工列表 (分页+搜索) |
| GET | /api/v1/vma/employees/:id | 员工详情 |
| POST | /api/v1/vma/employees | 创建员工 |
| PATCH | /api/v1/vma/employees/:id | 更新员工 |
| DELETE | /api/v1/vma/employees/:id | 软删除员工 |

### 部门 (Departments)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/departments | 部门列表 |
| POST | /api/v1/vma/departments | 创建部门 |
| PATCH | /api/v1/vma/departments/:id | 更新部门 |
| DELETE | /api/v1/vma/departments/:id | 软删除部门 |

### 库存事务 (Inventory Transactions)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/inventory-transactions | 事务列表 |
| POST | /api/v1/vma/inventory-transactions | 创建事务 |
| GET | /api/v1/vma/inventory-transactions/summary/:type | 库存汇总 |
| GET | /api/v1/vma/inventory-transactions/detail/:type/:spec | 库存明细 |
| GET | /api/v1/vma/inventory-transactions/demo | Demo 库存 |

### 临床案例 (Clinical Cases)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/clinical-cases | 案例列表 |
| POST | /api/v1/vma/clinical-cases | 创建案例 |
| POST | /api/v1/vma/clinical-cases/:id/complete | 完成案例 |
| POST | /api/v1/vma/clinical-cases/:id/reverse | 反转完成 |

### 培训 SOP
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/training-sops | SOP 列表 |
| POST | /api/v1/vma/training-sops | 创建 SOP |
| GET | /api/v1/vma/training-sops/smart-fill | Smart Fill 分析 |

### 培训记录 (Training Records)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vma/training-records | 记录列表 |
| POST | /api/v1/vma/training-records | 创建记录 |
| POST | /api/v1/vma/training-records/batch-pdf | 批量 PDF 生成 |

## 数据模型

### 核心模型
- **VmaEmployee**: 员工信息 (含 `deletedAt` 软删除)
- **VmaDepartment**: 部门信息 (含 `deletedAt` 软删除)
- **VmaEmployeeDepartment**: 员工-部门分配 (多对多, 含任命/移除日期)
- **VmaInventoryTransaction**: 库存事务 (含 `deletedAt` 软删除)
- **VmaClinicalCase**: 临床案例
- **VmaReceivingBatch**: 收货批次
- **VmaTrainingSop**: 培训 SOP (版本控制)
- **VmaTrainingRecord**: 培训记录
- **VmaTrainingSession**: 培训批次

### 产品模型
- **VmaPValveProduct**: P-Valve 产品目录
- **VmaDeliverySystemProduct**: 输送系统产品目录
- **VmaDeliverySystemFit**: 配合矩阵

## 权限

| 权限 | 说明 |
|------|------|
| vma.employees.manage | 员工管理 (CRUD) |
| vma.inventory.manage | 库存管理 |
| vma.clinical.manage | 临床案例管理 |
| vma.training.manage | 培训管理 |

> ⚠️ 当前权限粒度较粗 — 内部使用暂可接受，生产环境需细分。

## 依赖

- **PrismaModule**: 数据库访问
- **AuthModule**: JWT 认证 + 权限守卫
- **LoggingModule**: 审计日志
- **CacheModule**: Redis 缓存 (已集成, 待激活)

## 架构决策记录 (ADR)

### ADR-1: 软删除
所有核心模型使用 `deletedAt` 字段实现软删除，确保审计链完整。

### ADR-2: API 版本控制
全局前缀 `/api/v1`，便于未来版本迁移。

### ADR-3: 栈式编辑规则
部门分配只允许修改最近一条记录，防止历史数据被篡改。

### ADR-4: FEFO 库存分配
临床案例产品分配使用 First-Expired-First-Out 策略。

## 测试

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| inventory-transaction.service.spec.ts | 20 | 库存计算, 软删除, groupBy 聚合 |
| employees.service.spec.ts | 9 | 员工/部门软删除, 栈式规则 |

运行测试:
```bash
cd apps/api && npx jest --testPathPatterns="modules/vma" --verbose
```

## 审计

最新审计报告: `docs/vma_enterprise_audit_2026-02-11.md` (v1.4)
- 综合评分: **7.20/10**
- 已修复: 26/30 问题
- 待处理: React Query, God Module 拆分, E2E 测试, 电子签名
