# 📋 QA 审计报告（模板）

任务: {任务名称}
审计时间: {YYYY-MM-DD HH:MM}
Spec 文件: {路径}
审计人: {QA}

## 1) 审计结果总览

| 类别 | 状态 | 严重级 | 备注 |
|------|------|--------|------|
| 编译 | ✅/❌ | 🔴 | |
| 类型 | ✅/❌ | 🔴 | |
| 单元测试 | ✅/❌ | 🔴 | |
| 集成测试 | ✅/❌ | 🔴 | |
| E2E | ✅/⚠️ | 🟡 | |
| 运行 | ✅/❌ | 🔴 | |
| 功能 | ✅/❌ | 🔴 | |
| 回归 | ✅/❌ | 🔴 | |
| 安全 | ✅/❌ | 🔴 | |
| 数据 | ✅/❌ | 🔴 | |
| Diff | ✅/⚠️ | 🟡 | |
| 代码质量 | ✅/⚠️ | 🟡 | |
| i18n | ✅/⚠️ | 🟡 | |
| 日志 | ✅/⚠️ | 🟡 | |
| 性能 | ✅/⚠️ | 🟢 | |

## 2) 严重级汇总

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | {n} | pass/fail |
| HIGH | {n} | pass/warn |
| MEDIUM | {n} | info |
| LOW | {n} | note |

## 3) 判定

- [ ] ✅ Approve — 零 CRITICAL/HIGH
- [ ] ⚠️ Warning — 仅 HIGH
- [ ] 🔴 Block — 存在 CRITICAL

## 4) 发现的问题（ECC 格式）

## [FILE_PATH]
### 🔴 CRITICAL: [Issue Title]
**Line**: [number]
**Issue**: [description]
**Fix**: [fix]

## 5) 影响半径分析

| 变更文件 | 向下消费方 | 已验证? | 向上依赖 | 已验证? |
|---------|-----------|---------|---------|--------|
| {file} | {consumers} | ✅/❌ | {deps} | ✅/❌ |

## 6) 防复犯记录

- ERROR-BOOK: `{path or ERR-ID}`
- training: `{path if any}`
- 是否完成交叉检查: ✅/❌

## 7) 反死循环与执行稳定性记录

- 是否触发 LOOP_BREAK: ✅/❌
- 重复策略拦截次数: {n}
- 终端卡死/超时次数: {n}
- 是否使用 `core/scripts/safe-exec.sh`: ✅/❌
- 说明: {若触发，写明替代路径与结果}

## 8) 结论与交接

- 交接对象: CTO / PM
- 下一步: {返工工单 / 可交付用户}
