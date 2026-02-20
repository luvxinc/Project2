# Agent 文档门禁绿灯标准（Hard/Soft）

## 目标
将 `.agent` 文档链路质量固定为可自动化判定：
- **Hard = 0** 才能绿灯
- **Soft** 允许存在（模板示例/占位符），用于提示不阻塞

---

## 1) 绿灯判定

### 必须通过（Hard）
1. Legacy 路径检查通过
   - 禁止：缺失 `.claude/` 前缀的项目路径
   - 必须：`.claude/projects/{project}/...`
2. 引用完整性 Hard=0
   - 所有反引号 `.md` 引用（非 URL / 非通配 / 非模板变量）都必须能在仓库解析到实体文件

### 可提示不阻塞（Soft）
- 模板示例文件名（如 `ACCEPTED.md`、`requirements-list.md`、日期示例 spec/plan/checkpoint/audit）
- 占位变量路径（如 `{project}`）
- 通配符引用（如 `*.md`）

---

## 2) 执行命令

```bash
/Users/aaron/Developer/MGMTV2/.claude/core/scripts/agent-doc-audit.sh /Users/aaron/Developer/MGMTV2/.agent
```

输出解释：
- `❌ Hard missing references: N` → 阻塞（N 必须为 0）
- `⚪ Soft placeholders: N` → 非阻塞提示

---

## 3) V2 语义策略

- 允许出现“**V2 已彻底弃用**”这类禁用警示语
- 禁止出现“历史栈并行运行”语义或将已退役栈描述为现役运行栈

---

## 4) CI 建议

建议在 CI 中增加一步：

```bash
bash .claude/core/scripts/agent-doc-audit.sh .agent | tee /tmp/agent-doc-audit.log
! rg -q "❌ Hard missing references:" /tmp/agent-doc-audit.log
```

> 规则：只要出现 Hard missing，就 fail pipeline。
