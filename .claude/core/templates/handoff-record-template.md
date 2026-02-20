# 交接记录

> 时间: YYYY-MM-DD HH:MM
> 来源角色: {数据工程师 / 后端工程师 / ...}
> 目标角色: {后端工程师 / 前端工程师 / ...}

---

## 交付内容

| 交付物 | 路径/描述 | 状态 |
|--------|---------|------|
| Schema 变更 | `src/main/resources/db/migration/V{N}__xxx.sql` | ✅ 已完成 |
| DTO 定义 | `src/xxx/dto/XxxResponse.kt` | ✅ 已完成 |
| API 端点 | `POST /api/v1/xxx` | ✅ 已完成 |

## 接口约定

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键 |
| name | String | 名称 |

## 下游同步需求

- `[前端工程师]` 需要同步更新 `apps/web/src/lib/api/xxx.ts` 的 API Client 类型
- `[前端工程师]` 需要同步更新 `apps/web/src/app/.../page.tsx` 的调用逻辑
- 无下游影响: — (如果没有)

## 注意事项

- {任何接收方需要注意的事项、陷阱、约定}

## 接收确认

- 接收方: {角色名}
- 确认时间: YYYY-MM-DD HH:MM
- 确认状态: ⬜ 待确认 / ✅ 已确认 / ❌ 有问题: {描述}
