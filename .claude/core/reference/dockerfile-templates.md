# Dockerfile 模板参考

> **来源**: `skills/infrastructure.md §4` 压缩时外迁
> **用途**: 多阶段构建完整模板，供 CI/CD 和本地构建参考
> **项目特定**: 镜像 registry 前缀、基础镜像版本、构建命令 → 见 `CONTEXT.md §3`
> **占位符说明**: `{REGISTRY}` = 镜像仓库地址，`{PROJECT}` = 项目名，`{VERSION}` = 镜像标签

---

## 后端 Dockerfile 模板（具体镜像/构建工具见 CONTEXT.md §3 后端技术栈）

```dockerfile
# ── Stage 1: Build ──────────────────────────────────────────────
FROM {build_image} AS builder               # 见 CONTEXT.md §3 后端技术栈
WORKDIR /app
COPY {build_config_files} ./                 # 构建配置文件（如 gradle/, pom.xml, Cargo.toml）
RUN {dependency_cache_cmd}                   # 缓存依赖层（见 CONTEXT.md §5）
COPY src/ src/
RUN {build_cmd}                              # 构建命令（见 CONTEXT.md §5）

# ── Stage 2: Runtime ─────────────────────────────────────────────
FROM {runtime_image}                         # 见 CONTEXT.md §3 后端技术栈
WORKDIR /app

# 非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder {build_artifact_path} {runtime_artifact}

EXPOSE {backend_port}                        # 见 CONTEXT.md §3

HEALTHCHECK --interval=30s --timeout=10s --start-period={start_period} --retries=3 \
  CMD wget -qO- http://localhost:{backend_port}/{health_path} || exit 1

ENTRYPOINT {runtime_entrypoint}              # 见 CONTEXT.md §3 后端技术栈
```

**关键说明：**
- `{build_image}`：构建阶段，含完整构建工具链（见 CONTEXT.md §3）
- `{runtime_image}`：运行阶段，最小化镜像（见 CONTEXT.md §3）
- 所有 `{占位符}` 由 CONTEXT.md §3 + §5 定义
- `start-period`：按框架启动时间调整（JVM 框架通常 60s，Go/Rust 可缩短）

---

## 前端 Dockerfile 示例 (Next.js — node + pnpm standalone)

```dockerfile
# ── Stage 1: Dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN {package_manager_enable_cmd} && {build_cmd}

# ── Stage 3: Runtime (Standalone) ────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root 用户
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# standalone 模式只复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**关键说明：**
- `next.config.js` 必须设置 `output: 'standalone'`（否则 standalone 目录不存在）
- `--frozen-lockfile`：禁止 pnpm 修改 lockfile（CI 中必须）
- 三阶段分离：`deps` 缓存 node_modules；`builder` 执行构建；`runner` 精简运行时
- `server.js`：Next.js standalone 模式的入口文件（由 `next build` 自动生成）

---

## .dockerignore

```
node_modules
.next
.git
*.log
.env*
!.env.example
dist
coverage
```

---

*来源: infrastructure.md §4 | Version: 1.0.0 | Created: 2026-02-19*
