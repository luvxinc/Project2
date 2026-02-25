#!/bin/bash

# ══════════════════════════════════════════════════════════════
# ESPLUS ERP — 本地开发服务器 启动脚本
# ══════════════════════════════════════════════════════════════
# 用法: bash dev/start_dev.sh
# 说明: 一键启动 V3 全栈本地开发环境
#       • 后端: Spring Boot (Kotlin)   → localhost:8080
#       • 前端: Next.js (Turbo)        → localhost:3000
#       • 依赖: PostgreSQL (5432) + Redis (6379)
# ══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PID_DIR="$PROJECT_ROOT/.dev-pids"
LOG_DIR="$PROJECT_ROOT/logs"

# 确保目录存在
mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_ok()   { printf "${GREEN}✅${NC} %s\n" "$1"; }
log_warn() { printf "${YELLOW}⚠️${NC}  %s\n" "$1"; }
log_err()  { printf "${RED}❌${NC} %s\n" "$1"; }
log_info() { printf "${BLUE}ℹ️${NC}  %s\n" "$1"; }

printf "\n"
printf "${CYAN}══════════════════════════════════════════════════════${NC}\n"
printf "${CYAN}  ESPLUS ERP — 本地开发环境启动${NC}\n"
printf "${CYAN}  %s${NC}\n" "$(date '+%Y-%m-%d %H:%M:%S')"
printf "${CYAN}══════════════════════════════════════════════════════${NC}\n"
printf "\n"

# ══════════════════════════════════════════════════════════════
# PHASE 0: 先执行 stop 确保干净环境
# ══════════════════════════════════════════════════════════════
log_info "清理残留进程..."
bash "$SCRIPT_DIR/stop.sh" --quiet 2>/dev/null || true
sleep 1

# ══════════════════════════════════════════════════════════════
# PHASE 1: 依赖检查
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 1: 依赖检查${NC}\n"

# 检查 Java 21
if ! command -v java &> /dev/null; then
    log_err "Java 未安装。请安装 JDK 21: brew install openjdk@21"
    exit 1
fi
JAVA_VER=$(java -version 2>&1 | head -1 | awk -F '"' '{print $2}' | cut -d'.' -f1)
if [ "$JAVA_VER" -lt 21 ] 2>/dev/null; then
    log_warn "Java 版本 $JAVA_VER，建议 21+。可能有兼容性问题。"
else
    log_ok "Java $JAVA_VER"
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_err "Node.js 未安装。请安装: brew install node"
    exit 1
fi
log_ok "Node $(node -v)"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    log_err "pnpm 未安装。请安装: npm install -g pnpm"
    exit 1
fi
log_ok "pnpm $(pnpm -v)"

# 检查 PostgreSQL
if lsof -i :5432 -sTCP:LISTEN > /dev/null 2>&1; then
    log_ok "PostgreSQL (端口 5432 已监听)"
else
    log_warn "PostgreSQL 端口 5432 未监听，尝试启动..."
    brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
    if lsof -i :5432 -sTCP:LISTEN > /dev/null 2>&1; then
        log_ok "PostgreSQL 启动成功"
    else
        log_err "PostgreSQL 无法启动。请手动检查: brew services list"
        exit 1
    fi
fi

# 检查 Redis
if lsof -i :6379 -sTCP:LISTEN > /dev/null 2>&1; then
    log_ok "Redis (端口 6379 已监听)"
else
    log_warn "Redis 端口 6379 未监听，尝试启动..."
    brew services start redis 2>/dev/null || true
    sleep 2
    if lsof -i :6379 -sTCP:LISTEN > /dev/null 2>&1; then
        log_ok "Redis 启动成功"
    else
        log_err "Redis 无法启动。请手动检查: brew services list"
        exit 1
    fi
fi

# ══════════════════════════════════════════════════════════════
# PHASE 2: 检查端口
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 2: 端口检查${NC}\n"

for port in 8080 3000; do
    if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
        log_err "端口 $port 被占用 (PID: $(lsof -i :$port -sTCP:LISTEN -t | head -1))"
        log_info "请先运行 bash dev/stop.sh 清理"
        exit 1
    fi
done
log_ok "端口 8080 和 3000 均空闲"

# ══════════════════════════════════════════════════════════════
# PHASE 3: 启动后端 (Spring Boot)
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 3: 启动后端 (Spring Boot → :8080)${NC}\n"

cd "$PROJECT_ROOT"
nohup ./gradlew bootRun > "$LOG_DIR/v3-backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/v3-backend.pid"
log_info "后端启动中... (PID: $BACKEND_PID)"

# 等待后端就绪 (最多 60 秒)
log_info "等待后端就绪 (最多 60s)..."
WAITED=0
while [ $WAITED -lt 60 ]; do
    if curl -s http://localhost:8080/api/v1/actuator/health > /dev/null 2>&1; then
        break
    fi
    # 检查进程是否还活着
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

if [ $WAITED -ge 60 ]; then
    log_warn "后端 60s 内未响应健康检查，但进程仍在运行 (PID: $BACKEND_PID)"
    log_info "可能仍在编译中，查看日志: tail -f $LOG_DIR/v3-backend.log"
else
    log_ok "后端就绪! (${WAITED}s)"
fi

# ══════════════════════════════════════════════════════════════
# PHASE 4: 启动前端 (Next.js via Turbo)
# ══════════════════════════════════════════════════════════════
printf "\n${BLUE}▶ Phase 4: 启动前端 (Next.js → :3000)${NC}\n"

cd "$PROJECT_ROOT"
nohup npx turbo dev > "$LOG_DIR/v3-frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/v3-frontend.pid"
log_info "前端启动中... (PID: $FRONTEND_PID)"

# 等待前端就绪 (最多 120 秒 — Next.js 冷编译可能很慢)
log_info "等待前端就绪 (最多 120s, 首次编译较慢)..."
WAITED=0
while [ $WAITED -lt 120 ]; do
    # 检查端口是否在监听 (比 curl 可靠, 即使在编译中也能检测到)
    if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
        # 端口在监听了, 再等 3 秒让编译完成
        sleep 3
        break
    fi
    if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
        log_err "前端启动失败！查看日志: $LOG_DIR/v3-frontend.log"
        tail -20 "$LOG_DIR/v3-frontend.log" 2>/dev/null
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    printf "."
done
printf "\n"

if [ $WAITED -ge 120 ]; then
    log_warn "前端 120s 内未开始监听，但进程仍在运行 (PID: $FRONTEND_PID)"
    log_info "查看日志: tail -f $LOG_DIR/v3-frontend.log"
else
    log_ok "前端就绪! (${WAITED}s)"
fi

# ══════════════════════════════════════════════════════════════
# 启动完成
# ══════════════════════════════════════════════════════════════
printf "\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
printf "${GREEN}  ✅ ESPLUS ERP 本地开发环境已启动!${NC}\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
printf "\n"
printf "  🖥️  前端:  ${CYAN}http://localhost:3000${NC}  (PID: $FRONTEND_PID)\n"
printf "  ⚙️  后端:  ${CYAN}http://localhost:8080/api/v1${NC}  (PID: $BACKEND_PID)\n"
printf "  📊 Swagger: ${CYAN}http://localhost:8080/api/v1/swagger-ui${NC}\n"
printf "\n"
printf "  📄 后端日志: tail -f $LOG_DIR/v3-backend.log\n"
printf "  📄 前端日志: tail -f $LOG_DIR/v3-frontend.log\n"
printf "\n"
printf "  🛑 关闭: ${YELLOW}bash dev/stop.sh${NC}\n"
printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
