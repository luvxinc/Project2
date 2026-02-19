# Kernel Regression Suite v1

> 用于每次内核调整后的快速回归（10 场景）。

## 执行方式

```bash
# 1) 路由与知识
core/scripts/library-route-audit.sh
core/scripts/library-dedupe-audit.sh
core/scripts/library-resolve.sh review qa
core/scripts/library-resolve.sh memory token

# 2) 执行稳定性
core/scripts/safe-exec.sh --timeout 10 --idle-timeout 5 -- echo ok

# 3) 质量门禁
core/scripts/agent-doc-audit.sh .agent
core/scripts/memory-dedupe-audit.sh .agent/projects/mgmt
core/scripts/artifact-lifecycle-audit.sh .agent/projects/mgmt --tmp-only
core/scripts/security-extra-audit.sh . warn
```

## 场景清单（必须全绿）

1. catalog/index/meta 可达性
2. 切片重复检测
3. 关键词路由命中（engineering）
4. 关键词路由命中（cognition）
5. safe-exec 超时看门狗可用
6. 文档引用硬断链为 0
7. 记忆去重唯一性通过
8. 临时区审计可运行
9. 安全增强审计可运行（warn 模式）
10. /learn wrapper 自动判定路径可运行

## 结果记录模板

| 时间 | 分支/版本 | 通过数 | 失败数 | 备注 |
|---|---|---:|---:|---|
| {ts} | {ref} | {n} | {n} | {note} |
