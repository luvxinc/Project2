---
description: 灾备与恢复 — RTO/RPO 定义, 备份策略, 主从复制, DR 演练
---

# 灾备与恢复 (Disaster Recovery)

> **SLA 目标**: 99.9% (每年最多 8.76 小时停机)
> **核心原则**: 没有经过验证的灾备计划 = 没有灾备计划
> **权威规范**: `core/skills/infrastructure.md`

---

## 1. RTO / RPO 定义

| 组件 | RPO (可丢失数据) | RTO (恢复时间) | 备份方式 |
|------|-----------------|----------------|----------|
| **PostgreSQL (OLTP)** | 0 (零数据丢失) | < 1 分钟 | 同步流复制 + WAL 归档 + 每日全量 |
| **Redis (Cache)** | < 1 分钟 | < 30 秒 | Sentinel 自动故障转移 |
| **Kafka** | 0 (ISR 副本) | < 2 分钟 | 3 副本 + Rack-Aware |
| **OpenSearch** | < 5 分钟 | < 10 分钟 | 快照 + 从 Kafka 重建 |
| **ClickHouse** | < 1 小时 | < 30 分钟 | 从 Kafka 重放 + 每日备份 |
| **MinIO (文件)** | < 1 小时 | < 1 小时 | 纠删码 + 跨站点复制 |
| **应用服务** | N/A | < 2 分钟 | K8s 自动重启 + 滚动更新 |

---

## 2. PostgreSQL 高可用

### 2.1 主从架构

```
┌──────────────┐     同步复制      ┌──────────────┐
│  PG Primary  │ ──────────────→  │  PG Standby  │
│  (读写)       │                   │  (只读副本)   │
└──────┬───────┘                   └──────────────┘
       │
       │ WAL 归档
       ▼
┌──────────────┐
│  WAL Archive │ (MinIO / S3)
│  PITR 恢复点  │
└──────────────┘
```

### 2.2 备份策略

| 类型 | 频率 | 保留周期 | 工具 |
|------|------|----------|------|
| WAL 连续归档 | 实时 | 7 天 | pg_receivewal + MinIO |
| 基础全量备份 | 每日 02:00 PST | 30 天 | pg_basebackup |
| 逻辑备份 | 每周日 03:00 PST | 90 天 | pg_dump (schema + data) |
| PITR 恢复测试 | 每月第一个周一 | — | 恢复到测试环境验证 |

### 2.3 自动故障转移

```yaml
# Patroni (推荐) 或 repmgr
patroni:
  scope: mgmt-erp
  restapi:
    listen: 0.0.0.0:8008
  postgresql:
    parameters:
      wal_level: replica
      max_wal_senders: 5
      synchronous_commit: "on"
      synchronous_standby_names: "standby1"
  bootstrap:
    dcs:
      ttl: 30
      loop_wait: 10
      retry_timeout: 10
      maximum_lag_on_failover: 1048576  # 1MB
```

---

## 3. Redis 高可用

```
┌──────────┐
│ Sentinel │ × 3 (仲裁者)
└────┬─────┘
     │ 监控
     ▼
┌──────────┐     复制      ┌──────────┐
│  Master  │ ──────────→  │  Replica  │
└──────────┘              └──────────┘

故障转移: Sentinel 自动提升 Replica → 新 Master (< 30 秒)
```

### 配置
```conf
# sentinel.conf
sentinel monitor mgmt-master redis-master 6379 2
sentinel down-after-milliseconds mgmt-master 5000
sentinel failover-timeout mgmt-master 10000
sentinel parallel-syncs mgmt-master 1
```

---

## 4. Kafka 高可用

| 配置 | 值 | 说明 |
|------|-----|------|
| `replication.factor` | 3 | 每个 partition 3 副本 |
| `min.insync.replicas` | 2 | 至少 2 个副本确认 |
| `acks` | all | Producer 等待所有 ISR 确认 |
| Broker 数量 | ≥ 3 | 跨可用区部署 |
| `unclean.leader.election.enable` | false | 禁止数据不完整的副本成为 Leader |

---

## 5. 灾难恢复演练计划

### 5.1 演练频率

| 类型 | 频率 | 参与者 |
|------|------|--------|
| PG 故障转移演练 | 每季度 | DevOps + DBA |
| Redis 故障转移 | 每季度 | DevOps |
| 全系统 DR 演练 | 每半年 | 全团队 |
| 备份恢复验证 | 每月 | 自动化 (CI 脚本) |

### 5.2 演练步骤 (Runbook)

```
1. [通知] 提前 24 小时通知所有利益相关者
2. [备份] 确认最新备份可用
3. [模拟] 主动关闭 Primary PG
4. [验证] Patroni 自动故障转移 → 新 Primary 可写
5. [数据] 验证数据完整性 (行数/校验和)
6. [应用] 确认所有 Spring Boot 实例连接到新 Primary
7. [恢复] 原 Primary 修复后作为 Standby 重新加入
8. [报告] 记录 RTO 实际值, 归档演练报告
```

---

## 6. 事件响应分级

| 级别 | 定义 | RTO | 响应时间 | 通知 |
|------|------|-----|----------|------|
| **P1 Critical** | 全系统不可用 | < 15 分钟 | < 5 分钟 | 电话 + Slack + Email |
| **P2 High** | 核心模块不可用 (采购/销售) | < 30 分钟 | < 15 分钟 | Slack + Email |
| **P3 Medium** | 非核心模块不可用 (报表/搜索) | < 4 小时 | < 1 小时 | Slack |
| **P4 Low** | 性能降级但可用 | 下个工作日 | < 8 小时 | Ticket |

---

## 7. 数据保护铁律

| 规则 | 说明 |
|------|------|
| **3-2-1** | 3 份副本, 2 种介质, 1 份异地 |
| **备份加密** | AES-256 加密备份文件 |
| **备份测试** | 未经测试的备份 = 不存在的备份 |
| **PITR 窗口** | 至少支持 7 天内任意时间点恢复 |
| **审计** | 所有备份/恢复操作记录审计日志 |

---

*Version: 1.0.0 — 2026-02-11*
