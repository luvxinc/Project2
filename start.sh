#!/bin/bash

# ══════════════════════════════════════════════════════════════
# ESPLUS ERP — 一键启动 (Docker + Cloudflare Tunnel)
# ══════════════════════════════════════════════════════════════
# 用法: bash start.sh
# 说明: 一键启动全栈 Docker 服务 + Cloudflare 公网隧道 + 防休眠
#       • PostgreSQL 16    → :5432 (Docker)
#       • Redis 7          → :6379 (Docker)
#       • Backend (Boot)   → :8080 (Docker)
#       • Frontend (Next)  → :3000 (Docker)
#       • Cloudflare       → 公网域名
#       • caffeinate       → 防止 macOS 休眠
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
PID_DIR="$PROJECT_ROOT/.dev-pids"
LOG_DIR="$PROJECT_ROOT/logs"

# Cloudflare Tunnel Token
CF_TOKEN="${CF_TOKEN:-***REDACTED_CF_TOKEN***}"

# 确保目录存在
mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_ok()   { printf "${GREEN}✅${NC} %s\n" "$1"; }
log_warn() { printf "${YELLOW}⚠️${NC}  %s\n" "$1"; }
log_err()  { printf "${RED}❌${NC} %s\n" "$1"; }
log_info() { printf "${BLUE}ℹ️${NC}  %s\n" "$1"; }

printf "\n"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
printf "${MAGENTA}  ESPLUS ERP — 一键启动${NC}\n"
printf "${MAGENTA}  %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
printf "\n"

# ══════════════════════════════════════════════════════════════
# PHASE 0: 清理残留
# ══════════════════════════════════════════════════════════════
log_info "清理残留进程..."
bash "$PROJECT_ROOT/stop.sh" --quiet 2>/dev/null || true
sleep 1

# ══════════════════════════════════════════════════════════════
# PHASE 1: 依赖检查
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 1: 依赖检查${NC}\n"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    log_err "Docker 未安装。请安装 Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi
if ! docker info &> /dev/null; then
    log_err "Docker 未运行。请启动 Docker Desktop。"
    exit 1
fi
log_ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# 检查 docker compose
if ! docker compose version &> /dev/null; then
    log_err "docker compose 未找到。请升级 Docker Desktop。"
    exit 1
fi
log_ok "Docker Compose $(docker compose version --short)"

# 检查 cloudflared
if command -v cloudflared &> /dev/null; then
    log_ok "cloudflared $(cloudflared --version 2>&1 | awk '{print $3}' | head -1)"
    HAS_CF=true
else
    log_warn "cloudflared 未安装 (跳过公网隧道)"
    HAS_CF=false
fi

# ══════════════════════════════════════════════════════════════
# PHASE 2: 端口检查
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 2: 端口检查${NC}\n"

CONFLICT=false
for port in 5432 6379 8080 3000; do
    if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
        PID=$(lsof -i :$port -sTCP:LISTEN -t | head -1)
        PROC=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
        log_warn "端口 $port 被占用 (PID: $PID, $PROC)"
        CONFLICT=true
    fi
done

if [ "$CONFLICT" = true ]; then
    printf "\n"
    log_info "检测到端口冲突。停止本机服务..."
    brew services stop postgresql@15 2>/dev/null || brew services stop postgresql 2>/dev/null || true
    brew services stop redis 2>/dev/null || true
    sleep 2

    # 再次检查关键端口
    for port in 5432 6379 8080 3000; do
        if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
            log_err "端口 $port 仍被占用。请手动关闭后重试。"
            exit 1
        fi
    done
    log_ok "端口冲突已解决"
else
    log_ok "所有端口 (5432, 6379, 8080, 3000) 均空闲"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 3: 启动 Docker Compose
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 3: 启动 Docker 全栈服务${NC}\n"

cd "$PROJECT_ROOT"

# 检查镜像是否需要构建
if docker images esplus-backend --format "{{.ID}}" 2>/dev/null | grep -q .; then
    log_info "镜像已存在，启动容器..."
    docker compose up -d
else
    log_info "首次启动，构建镜像 (可能需要 5-10 分钟)..."
    docker compose up -d --build
fi

# 等待 PostgreSQL 就绪
log_info "等待 PostgreSQL 就绪..."
WAITED=0
while [ $WAITED -lt 30 ]; do
    if docker compose exec -T postgres pg_isready -U aaron > /dev/null 2>&1; then
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
done
printf "\n"
if [ $WAITED -ge 30 ]; then
    log_warn "PostgreSQL 30s 内未就绪"
else
    log_ok "PostgreSQL 就绪 (${WAITED}s)"
fi

# 等待 Redis 就绪
if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    log_ok "Redis 就绪"
else
    log_warn "Redis 未就绪"
fi

# 等待后端健康
log_info "等待后端就绪 (最多 120s)..."
WAITED=0
while [ $WAITED -lt 120 ]; do
    if curl -sf http://localhost:8080/api/v1/health > /dev/null 2>&1; then
        break
    fi
    if ! docker compose ps backend --format "{{.Status}}" 2>/dev/null | grep -qi "up"; then
        log_err "后端容器已退出！"
        docker compose logs backend --tail 30
        exit 1
    fi
    sleep 3
    WAITED=$((WAITED + 3))
    printf "."
done
printf "\n"
if [ $WAITED -ge 120 ]; then
    log_warn "后端 120s 内未通过健康检查"
    log_info "查看日志: docker compose logs -f backend"
else
    log_ok "后端就绪 (${WAITED}s)"
fi

# 等待前端就绪
log_info "等待前端就绪 (最多 60s)..."
WAITED=0
while [ $WAITED -lt 60 ]; do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        break
    fi
    sleep 3
    WAITED=$((WAITED + 3))
    printf "."
done
printf "\n"
if [ $WAITED -ge 60 ]; then
    log_warn "前端 60s 内未就绪"
else
    log_ok "前端就绪 (${WAITED}s)"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 4: 启动 Cloudflare Tunnel (可选)
# ══════════════════════════════════════════════════════════════
if [ "$HAS_CF" = true ] && [ "$CF_TOKEN" != "YOUR_CF_TOKEN_HERE" ]; then
    printf "\n${BLUE}▶ Phase 4: 启动 Cloudflare Tunnel${NC}\n"

    nohup cloudflared tunnel run --token $CF_TOKEN > "$LOG_DIR/cloudflared.log" 2>&1 &
    TUNNEL_PID=$!
    echo $TUNNEL_PID > "$PID_DIR/tunnel.pid"
    log_ok "Cloudflare Tunnel 已启动 (PID: $TUNNEL_PID)"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 5: 防休眠
# ══════════════════════════════════════════════════════════════
nohup caffeinate -ims > /dev/null 2>&1 &
CAFE_PID=$!
echo $CAFE_PID > "$PID_DIR/caffeinate.pid"

# ══════════════════════════════════════════════════════════════
# 启动完成
# ══════════════════════════════════════════════════════════════
printf "\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
printf "${GREEN}  ✅ ESPLUS ERP 全栈启动完成!${NC}\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
printf "\n"
printf "  🖥️  前端:    ${CYAN}http://localhost:3000${NC}\n"
printf "  ⚙️  后端:    ${CYAN}http://localhost:8080/api/v1${NC}\n"
printf "  📊 健康检查: ${CYAN}http://localhost:8080/api/v1/health${NC}\n"
printf "  🐘 数据库:   PostgreSQL :5432 (Docker)\n"
printf "  🔴 缓存:     Redis :6379 (Docker)\n"
if [ "$HAS_CF" = true ] && [ "$CF_TOKEN" != "YOUR_CF_TOKEN_HERE" ]; then
    printf "  🌐 隧道:     Cloudflare Tunnel (PID: $TUNNEL_PID)\n"
fi
printf "  🔒 防休眠:   已开启\n"
printf "\n"
printf "  📄 查看日志:     ${YELLOW}docker compose logs -f${NC}\n"
printf "  📄 后端日志:     ${YELLOW}docker compose logs -f backend${NC}\n"
printf "  📄 隧道日志:     ${YELLOW}tail -f logs/cloudflared.log${NC}\n"
printf "\n"
printf "  🛑 关闭全部:     ${YELLOW}bash stop.sh${NC}\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
