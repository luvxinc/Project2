#!/bin/bash

# ══════════════════════════════════════════════════════════════
# ESPLUS ERP — 公网服务器 启动脚本
# ══════════════════════════════════════════════════════════════
# 用法: bash dev/start_online.sh
# 说明: 启动 V3 全栈 + Cloudflare Tunnel 公网访问
#       • 后端: Spring Boot (Kotlin)   → localhost:8080 → 公网
#       • 前端: Next.js (Turbo)        → localhost:3000 → 公网
#       • 隧道: Cloudflare Tunnel      → 公网域名
#       • 防休眠: caffeinate 保持系统唤醒
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PID_DIR="$PROJECT_ROOT/.dev-pids"
LOG_DIR="$PROJECT_ROOT/logs"

# Cloudflare Token (与 ops/start_server.sh 一致)
CF_TOKEN="***REDACTED_CF_TOKEN***"

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
printf "${MAGENTA}  ESPLUS ERP — 公网服务器启动${NC}\n"
printf "${MAGENTA}  %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
printf "\n"

# ══════════════════════════════════════════════════════════════
# PHASE 0: 先清理
# ══════════════════════════════════════════════════════════════
log_info "清理残留进程..."
bash "$SCRIPT_DIR/stop.sh" --quiet 2>/dev/null || true
sleep 1

# ══════════════════════════════════════════════════════════════
# PHASE 1: 依赖检查
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 1: 依赖检查${NC}\n"

# 检查 cloudflared
if ! command -v cloudflared &> /dev/null; then
    log_err "cloudflared 未安装。请安装: brew install cloudflared"
    exit 1
fi
log_ok "cloudflared $(cloudflared --version 2>&1 | head -1)"

# 检查 Java 21
if ! command -v java &> /dev/null; then
    log_err "Java 未安装。请安装 JDK 21: brew install openjdk@21"
    exit 1
fi
log_ok "Java $(java -version 2>&1 | head -1 | awk -F '"' '{print $2}')"

# 检查 PostgreSQL
if ! lsof -i :5432 -sTCP:LISTEN > /dev/null 2>&1; then
    log_warn "PostgreSQL 未运行，尝试启动..."
    # 清理残留的 postmaster.pid（非正常关机后的常见问题）
    PG_DATA_DIR="/opt/homebrew/var/postgresql@15"
    if [ -f "$PG_DATA_DIR/postmaster.pid" ]; then
        OLD_PID=$(head -1 "$PG_DATA_DIR/postmaster.pid")
        if ! ps -p "$OLD_PID" -o comm= 2>/dev/null | grep -q postgres; then
            log_warn "检测到残留 postmaster.pid (PID: $OLD_PID 已不存在)，正在清理..."
            rm -f "$PG_DATA_DIR/postmaster.pid"
        fi
    fi
    brew services stop postgresql@15 2>/dev/null || true
    sleep 1
    brew services start postgresql@15 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 3
fi
if lsof -i :5432 -sTCP:LISTEN > /dev/null 2>&1; then
    log_ok "PostgreSQL"
else
    log_err "PostgreSQL 无法启动。请检查: tail -50 /opt/homebrew/var/postgresql@15/server.log"
    exit 1
fi

# 检查 Redis
if ! lsof -i :6379 -sTCP:LISTEN > /dev/null 2>&1; then
    log_warn "Redis 未运行，尝试启动..."
    brew services start redis 2>/dev/null || true
    sleep 2
fi
if lsof -i :6379 -sTCP:LISTEN > /dev/null 2>&1; then
    log_ok "Redis"
else
    log_err "Redis 无法启动"
    exit 1
fi

# ══════════════════════════════════════════════════════════════
# PHASE 2: 端口检查
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 2: 端口检查${NC}\n"

for port in 8080 3000; do
    if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
        log_err "端口 $port 被占用"
        exit 1
    fi
done
log_ok "端口 8080 和 3000 均空闲"

# ══════════════════════════════════════════════════════════════
# PHASE 3: 启动 Cloudflare Tunnel
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 3: 启动 Cloudflare Tunnel${NC}\n"

nohup cloudflared tunnel run --token $CF_TOKEN > "$LOG_DIR/cloudflared.log" 2>&1 &
TUNNEL_PID=$!
echo $TUNNEL_PID > "$PID_DIR/tunnel.pid"
log_ok "Cloudflare Tunnel 已启动 (PID: $TUNNEL_PID)"

# ══════════════════════════════════════════════════════════════
# PHASE 4: 启动后端 (Spring Boot) — 绑定 0.0.0.0
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 4: 启动后端 (Spring Boot → 0.0.0.0:8080)${NC}\n"

cd "$PROJECT_ROOT"
# 使用 caffeinate 防止系统休眠
nohup caffeinate -ims ./gradlew bootRun > "$LOG_DIR/v3-backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/v3-backend.pid"
log_info "后端启动中... (PID: $BACKEND_PID)"

# 等待后端就绪
log_info "等待后端就绪 (最多 90s)..."
WAITED=0
while [ $WAITED -lt 90 ]; do
    if curl -s http://localhost:8080/api/v1/actuator/health > /dev/null 2>&1; then
        break
    fi
    if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
        log_err "后端启动失败！查看日志: $LOG_DIR/v3-backend.log"
        tail -20 "$LOG_DIR/v3-backend.log" 2>/dev/null
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
done
printf "\n"

if [ $WAITED -ge 90 ]; then
    log_warn "后端 90s 内未响应健康检查，但进程仍在运行"
else
    log_ok "后端就绪! (${WAITED}s)"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 5: 启动前端 (Next.js)
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 5: 启动前端 (Next.js → :3000)${NC}\n"

cd "$PROJECT_ROOT"
nohup npx turbo dev > "$LOG_DIR/v3-frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/v3-frontend.pid"
log_info "前端启动中... (PID: $FRONTEND_PID)"

# 等待前端就绪
log_info "等待前端就绪 (最多 60s)..."
WAITED=0
while [ $WAITED -lt 60 ]; do
    if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
        sleep 3
        break
    fi
    if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
        log_err "前端启动失败！"
        tail -20 "$LOG_DIR/v3-frontend.log" 2>/dev/null
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
done
printf "\n"

if [ $WAITED -ge 60 ]; then
    log_warn "前端 60s 内未响应，但进程仍在运行"
else
    log_ok "前端就绪! (${WAITED}s)"
fi

# ══════════════════════════════════════════════════════════════
# 启动完成
# ══════════════════════════════════════════════════════════════
printf "\n"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
printf "${MAGENTA}  ✅ ESPLUS ERP 公网服务已启动!${NC}\n"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
printf "\n"
printf "  🖥️  前端:  ${CYAN}http://localhost:3000${NC}  (PID: $FRONTEND_PID)\n"
printf "  ⚙️  后端:  ${CYAN}http://localhost:8080/api/v1${NC}  (PID: $BACKEND_PID)\n"
printf "  🌐 隧道:  PID: $TUNNEL_PID\n"
printf "  🔒 防休眠: 已开启 (caffeinate)\n"
printf "\n"
printf "  📄 后端日志:  tail -f $LOG_DIR/v3-backend.log\n"
printf "  📄 前端日志:  tail -f $LOG_DIR/v3-frontend.log\n"
printf "  📄 隧道日志:  tail -f $LOG_DIR/cloudflared.log\n"
printf "\n"
printf "  🛑 关闭: ${YELLOW}bash dev/stop.sh${NC}\n"
printf "${MAGENTA}══════════════════════════════════════════════════════${NC}\n"
