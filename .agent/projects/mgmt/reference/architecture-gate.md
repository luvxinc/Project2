# MGMT 架构合规门禁

> **真相源**: `projects/mgmt/reference/v3-architecture.md`（技术栈主文件）
> **模板来源**: `core/reference/architecture-gate-template.md`
> **用途**: build/guard/ship 工作流共享的 MGMT 架构合规检查入口

---

## 文档索引

| 文档 | 用途 |
|------|------|
| `reference/v3-architecture.md` | V3 技术栈/DDD 规范/API规范/数据库/SLA（主文件） |
| `data/audits/BASELINE-v3-architecture-audit.md` | V3 架构质量基线 |
| `data/audits/BASELINE-v3-deep-quality-audit.md` | Schema/索引/算法质量审计基线 |
| `reference/testing-strategy.md` | 测试分层策略 |
| `reference/resilience.md` | 弹性模式（Resilience4j） |
| `reference/disaster-recovery.md` | 灾备与恢复 |
| `reference/config-management.md` | 配置中心（Vault） |
| `reference/kafka-design.md` | Kafka 事件设计 |

---

## 架构合规铁律

| 规则 | 不合规后果 |
|------|----------|
| **后端必须 Kotlin + Spring Boot 3.x** | Block |
| **DDD 分层: domain → application → infrastructure → api** | Block |
| **Controller 禁止写业务逻辑**（只做入参校验 + 调用 UseCase） | Block |
| **Domain 层禁止 import Spring/JPA** | Block |
| **数据库禁止 Type Erasure**（TEXT 存日期/金额/ID） | Block |
| **所有写操作必须审计日志**（traceId + userId + IP） | Block |
| **安全等级 L1-L4 四级模型**（见 `playbooks/security.md`） | Block |
| **统一响应格式**（`{ success, data, pagination/error }`） | Warning |
| **i18n 从第一行代码开始** | Warning |
| **API 命名: RESTful 资源式**（禁止 /getX, /createY） | Warning |

---

## 各工作流合规重点

| 工作流 | 关注重点 |
|--------|---------|
| **build** | DDD 分层 + Controller 规范 + 数据库规范 + 审计日志 |
| **guard** | DDD 分层 + API 规范 + 安全等级模型 |
| **ship** | 云原生基础设施（Docker/K8s/CI-CD） + 弹性与韧性 |

---

*来源: core/reference/v3-architecture-gate.md 迁移至 L4 | Version: 1.1.0 | Updated: 2026-02-19*
