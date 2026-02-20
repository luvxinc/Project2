# 📋 采集报告

> 任务: {任务名称}
> 时间: YYYY-MM-DD HH:MM

## 找到的相关文件

- `path/to/file.kt` — 现有实现 (XX 行)
- `path/to/migration.sql` — 数据模型
- ...

## 找到的 KI (关键信息)

- KI: "xxx" — 相关度: 高/中/低

## 找到的实施方案

- `playbooks/xxx.md` §X — 直接相关
- 无匹配 → 从头实现

## 依赖链

- 改 A → 影响 B, C
- 改 Schema → 需要 Flyway Migration
- 接口变更 → 前端 API Client 需同步更新

## ❓ 采集后发现的问题

1. ❓ {需要确认的点}
