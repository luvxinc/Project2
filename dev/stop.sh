#!/bin/bash

# ══════════════════════════════════════════════════════════════
# MGMT V3 — 统一关闭脚本
# ══════════════════════════════════════════════════════════════
# 用法: bash dev/stop.sh
# 说明: 一键关闭所有 V3 服务 (后端 + 前端 + 依赖进程)
#       同时兼容关闭公网 (Cloudflare Tunnel) 进程
# ══════════════════════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_DIR="$PROJECT_ROOT/.dev-pids"
OPS_DIR="$PROJECT_ROOT/ops"

# 静默模式 (被 start_dev.sh 调用时)
QUIET=false
if [ "$1" = "--quiet" ]; then
    QUIET=true
fi

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_ok()   { [ "$QUIET" = false ] && printf "${GREEN}✅${NC} %s\n" "$1"; }
log_warn() { [ "$QUIET" = false ] && printf "${YELLOW}⚠️${NC}  %s\n" "$1"; }
log_info() { [ "$QUIET" = false ] && printf "   %s\n" "$1"; }

if [ "$QUIET" = false ]; then
    printf "\n"
    printf "${RED}══════════════════════════════════════════════════════${NC}\n"
    printf "${RED}  MGMT V3 — 关闭所有服务${NC}\n"
    printf "${RED}══════════════════════════════════════════════════════${NC}\n"
    printf "\n"
fi

KILLED=0

# ══════════════════════════════════════════════════════════════
# 1. 通过 PID 文件关闭 (精确终止)
# ══════════════════════════════════════════════════════════════

stop_by_pid_file() {
    local label="$1"
    local pid_file="$2"

    if [ -f "$pid_file" ]; then
        local PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null
            sleep 1
            # 如果还活着就强制杀
            if ps -p $PID > /dev/null 2>&1; then
                kill -9 $PID 2>/dev/null || true
            fi
            log_ok "已停止 $label (PID: $PID)"
            KILLED=$((KILLED + 1))
        else
            log_warn "$label 进程不存在 (PID: $PID, stale)"
        fi
        rm -f "$pid_file"
    fi
}

# V3 后端 (Spring Boot)
stop_by_pid_file "V3 后端 (Spring Boot)" "$PID_DIR/v3-backend.pid"

# V3 前端 (Turbo/Next.js)
stop_by_pid_file "V3 前端 (Next.js)" "$PID_DIR/v3-frontend.pid"

# V2 前端 Turbo (兼容 scripts/dev.sh)
stop_by_pid_file "Turbo Dev" "$PID_DIR/turbo.pid"

# 老架构 Django
stop_by_pid_file "Django" "$OPS_DIR/django.pid"

# 老架构 Cloudflare Tunnel
stop_by_pid_file "Cloudflare Tunnel" "$OPS_DIR/tunnel.pid"

# ══════════════════════════════════════════════════════════════
# 2. 清理孤儿进程 (端口占用 + 进程名匹配)
# ══════════════════════════════════════════════════════════════

if [ "$QUIET" = false ]; then
    printf "\n${YELLOW}▶ 清理孤儿进程...${NC}\n"
fi

# Spring Boot / Java (端口 8080)
JAVA_PIDS=$(lsof -i :8080 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$JAVA_PIDS" ]; then
    echo "$JAVA_PIDS" | xargs kill -9 2>/dev/null || true
    log_ok "清理端口 8080 的 Java 进程: $JAVA_PIDS"
    KILLED=$((KILLED + 1))
fi

# Gradle daemon (bootRun 使用)
BOOTRUN_PIDS=$(pgrep -f "bootRun" 2>/dev/null || true)
if [ -n "$BOOTRUN_PIDS" ]; then
    echo "$BOOTRUN_PIDS" | xargs kill 2>/dev/null || true
    log_ok "清理 bootRun 进程: $BOOTRUN_PIDS"
    KILLED=$((KILLED + 1))
fi

# Spring Boot 应用
SPRING_PIDS=$(pgrep -f "mgmt-v3" 2>/dev/null || true)
if [ -n "$SPRING_PIDS" ]; then
    echo "$SPRING_PIDS" | xargs kill 2>/dev/null || true
    log_ok "清理 Spring Boot 进程: $SPRING_PIDS"
    KILLED=$((KILLED + 1))
fi

# Next.js (端口 3000)
NEXT_PIDS=$(lsof -i :3000 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$NEXT_PIDS" ]; then
    echo "$NEXT_PIDS" | xargs kill -9 2>/dev/null || true
    log_ok "清理端口 3000 的 Next.js 进程: $NEXT_PIDS"
    KILLED=$((KILLED + 1))
fi

# Turbo
pkill -f "turbo dev" 2>/dev/null && { log_ok "清理 turbo dev 进程"; KILLED=$((KILLED + 1)); } || true
pkill -f "turbo.*daemon" 2>/dev/null || true

# Next Server 残留
pkill -f "next-server" 2>/dev/null && { log_ok "清理 next-server 残留进程"; KILLED=$((KILLED + 1)); } || true

# Django 残留
pkill -f "manage.py runserver" 2>/dev/null && { log_ok "清理 Django 残留进程"; KILLED=$((KILLED + 1)); } || true

# Cloudflare 残留
pkill -f "cloudflared" 2>/dev/null && { log_ok "清理 Cloudflare 残留进程"; KILLED=$((KILLED + 1)); } || true

# Caffeinate 残留 (老架构的防休眠)
pkill -f "caffeinate.*python" 2>/dev/null && { log_ok "清理 caffeinate 残留进程"; KILLED=$((KILLED + 1)); } || true

# ══════════════════════════════════════════════════════════════
# 3. 清理临时文件
# ══════════════════════════════════════════════════════════════

# 清理 turbo daemon stale PIDs
rm -rf /var/folders/zr/*/T/turbod/* 2>/dev/null || true

# 清理本地 PID 文件
rm -f "$PID_DIR"/*.pid 2>/dev/null || true

# ══════════════════════════════════════════════════════════════
# 4. 等待并最终确认
# ══════════════════════════════════════════════════════════════
sleep 1

# 强制终止残留
for port in 8080 3000; do
    REMAINING=$(lsof -i :$port -sTCP:LISTEN -t 2>/dev/null || true)
    if [ -n "$REMAINING" ]; then
        echo "$REMAINING" | xargs kill -9 2>/dev/null || true
        log_warn "强制清理端口 $port 残留: $REMAINING"
    fi
done

# ══════════════════════════════════════════════════════════════
# 完成
# ══════════════════════════════════════════════════════════════
if [ "$QUIET" = false ]; then
    printf "\n"
    printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
    if [ $KILLED -gt 0 ]; then
        printf "${GREEN}  😴 所有服务已关闭 (清理了 %d 个进程)${NC}\n" "$KILLED"
    else
        printf "${GREEN}  😴 没有发现运行中的服务${NC}\n"
    fi
    printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
    printf "\n"

    # 最终端口确认
    printf "  端口状态:\n"
    for port in 8080 3000; do
        if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
            printf "    端口 %s: ${RED}仍被占用${NC}\n" "$port"
        else
            printf "    端口 %s: ${GREEN}已释放${NC}\n" "$port"
        fi
    done
    printf "\n"
fi
