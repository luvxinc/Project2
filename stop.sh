#!/bin/bash

# ══════════════════════════════════════════════════════════════
# ESPLUS ERP — 一键关闭
# ══════════════════════════════════════════════════════════════
# 用法: bash stop.sh
# 说明: 一键关闭所有服务 (Docker + Cloudflare + caffeinate)
# ══════════════════════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
PID_DIR="$PROJECT_ROOT/.dev-pids"

# 静默模式 (被 start.sh 调用时)
QUIET=false
if [ "$1" = "--quiet" ]; then
    QUIET=true
fi

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok()   { [ "$QUIET" = false ] && printf "${GREEN}✅${NC} %s\n" "$1"; }
log_warn() { [ "$QUIET" = false ] && printf "${YELLOW}⚠️${NC}  %s\n" "$1"; }
log_info() { [ "$QUIET" = false ] && printf "   %s\n" "$1"; }

if [ "$QUIET" = false ]; then
    printf "\n"
    printf "${RED}══════════════════════════════════════════════════════${NC}\n"
    printf "${RED}  ESPLUS ERP — 关闭所有服务${NC}\n"
    printf "${RED}══════════════════════════════════════════════════════${NC}\n"
    printf "\n"
fi

KILLED=0

# ══════════════════════════════════════════════════════════════
# 1. 停止 Docker Compose 容器
# ══════════════════════════════════════════════════════════════
if docker compose ps --quiet 2>/dev/null | grep -q .; then
    if [ "$QUIET" = false ]; then
        printf "${YELLOW}▶ 停止 Docker 容器...${NC}\n"
    fi
    docker compose stop 2>/dev/null
    log_ok "Docker 容器已停止"
    KILLED=$((KILLED + 1))
else
    log_info "无运行中的 Docker 容器"
fi

# ══════════════════════════════════════════════════════════════
# 2. 通过 PID 文件关闭附属进程
# ══════════════════════════════════════════════════════════════

stop_by_pid_file() {
    local label="$1"
    local pid_file="$2"

    if [ -f "$pid_file" ]; then
        local PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null 2>&1; then
            kill $PID 2>/dev/null
            sleep 1
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

# Cloudflare Tunnel
stop_by_pid_file "Cloudflare Tunnel" "$PID_DIR/tunnel.pid"

# caffeinate 防休眠
stop_by_pid_file "caffeinate" "$PID_DIR/caffeinate.pid"

# ══════════════════════════════════════════════════════════════
# 3. 清理孤儿进程
# ══════════════════════════════════════════════════════════════

if [ "$QUIET" = false ]; then
    printf "\n${YELLOW}▶ 清理孤儿进程...${NC}\n"
fi

# Cloudflare 残留
pkill -f "cloudflared" 2>/dev/null && { log_ok "清理 Cloudflare 残留进程"; KILLED=$((KILLED + 1)); } || true

# caffeinate 残留
pkill -f "caffeinate" 2>/dev/null && { log_ok "清理 caffeinate 残留进程"; KILLED=$((KILLED + 1)); } || true

# 清理 PID 文件
rm -f "$PID_DIR"/*.pid 2>/dev/null || true

# ══════════════════════════════════════════════════════════════
# 完成
# ══════════════════════════════════════════════════════════════
if [ "$QUIET" = false ]; then
    printf "\n"
    printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
    if [ $KILLED -gt 0 ]; then
        printf "${GREEN}  😴 所有服务已关闭 (清理了 %d 个服务)${NC}\n" "$KILLED"
    else
        printf "${GREEN}  😴 没有发现运行中的服务${NC}\n"
    fi
    printf "${GREEN}══════════════════════════════════════════════════════${NC}\n"
    printf "\n"

    # Docker 容器状态
    printf "  Docker 容器:\n"
    CONTAINERS=$(docker compose ps --format "{{.Name}}: {{.Status}}" 2>/dev/null)
    if [ -n "$CONTAINERS" ]; then
        echo "$CONTAINERS" | while read line; do
            printf "    ${YELLOW}$line${NC}\n"
        done
    else
        printf "    ${GREEN}全部已停止${NC}\n"
    fi

    # 端口确认
    printf "\n  端口状态:\n"
    for port in 5432 6379 8080 3000; do
        if lsof -i ":$port" -sTCP:LISTEN > /dev/null 2>&1; then
            printf "    端口 %s: ${RED}仍被占用${NC}\n" "$port"
        else
            printf "    端口 %s: ${GREEN}已释放${NC}\n" "$port"
        fi
    done

    printf "\n  💡 完全删除数据: ${YELLOW}docker compose down -v${NC}\n"
    printf "\n"
fi
