# Output Format Regression Samples

## Invalid samples (expected FAIL)

### bad-engineer.md
```md
## ✅ 完工摘要
- done
```
Missing: 变更文件清单/验证结果/影响半径/UNKNOWN/证据

### bad-delivery-gate.md
```md
📋 交付闸门:
├── [✅] 编译通过
└── [✅] i18n 覆盖
```
Missing: 需求逐条对照/CSS/行为等价确认/功能验证

## Valid samples (expected PASS)
Use canonical templates under `core/templates/*.md`.
