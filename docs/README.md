# MGMT V2 Migration Project

## 项目目标

将现有 Django + MySQL + Server-Side Rendering 架构迁移至：
- **后端**: TypeScript + NestJS + PostgreSQL + Prisma
- **Web**: Next.js + React + TypeScript
- **Mobile**: React Native + Expo (或 Flutter)
- **架构**: Monorepo (pnpm + Turborepo)

## 迁移策略

采用 **Parallel Run** 策略：
1. 老系统 (`/MGMT`) 继续运行，不做改动
2. 新系统 (`/MGMTV2`) 独立开发
3. 新系统完成并验证后，整体切换

## 项目阶段

| 阶段 | 周期 | 状态 |
|------|------|------|
| Phase 1: 准备阶段 | 2-3 周 | ✅ **已完成** |
| Phase 2: 技术验证 | 3-4 周 | 🟡 **待开始** ← 下一步 |
| Phase 3: 全量重写 | 4-5 月 | ⚪ 待开始 |
| Phase 4: 切换上线 | 2-3 周 | ⚪ 待开始 |

## Phase 1 准备阶段 详细目录 ✅

```
docs/phase1_preparation/
├── 01_feature_inventory/     # 功能清单 ✅
│   ├── overview.md           # 功能模块总览
│   ├── sales.md              # 销售模块
│   ├── purchase.md           # 采购模块
│   ├── inventory.md          # 库存模块
│   ├── finance.md            # 财务模块
│   ├── products.md           # 产品模块
│   ├── db_admin.md           # 数据库运维
│   ├── user_admin.md         # 用户权限
│   └── audit.md              # 审计日志
│
├── 02_database_schema/       # 数据库设计 ✅
│   ├── current_schema.md     # 当前 Schema 分析
│   ├── er_diagram.md         # ER 图  
│   ├── migration_plan.md     # 迁移方案
│   └── data_mapping.md       # 新旧数据映射 ⭐ NEW
│
├── 03_tech_stack/            # 技术栈 ✅
│   ├── comparison.md         # 技术对比
│   ├── final_decision.md     # 最终选型 ⭐ NEW
│   └── monorepo_structure.md # Monorepo 目录结构
│
├── 04_api_specification/     # API 规范 ✅
│   ├── design_principles.md  # 设计原则
│   ├── auth_api.md           # 认证 API ⭐ NEW
│   ├── core_api.md           # 核心业务 API ⭐ NEW
│   └── openapi_template.yaml # OpenAPI 模板 ⭐ NEW
│
└── 05_timeline/              # 时间规划 ✅
    ├── milestones.md         # 里程碑
    ├── risk_assessment.md    # 风险评估
    └── decision_log.md       # 决策日志
```

## 关键原则

1. **老系统不动**: 任何改动只在新目录进行
2. **数据兼容优先**: 新 Schema 必须能无损迁移老数据
3. **功能 100% 覆盖**: 新系统必须覆盖老系统所有 P0 功能才能切换
4. **设定硬性 Deadline**: 6 个月内完成，否则止损

---

*Created: 2026-02-04*
*Last Updated: 2026-02-04*
