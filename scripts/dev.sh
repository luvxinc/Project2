#!/bin/bash
# MGMT V2 开发服务器管理脚本
# 用法: ./scripts/dev.sh [start|stop|restart|status]

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$PROJECT_ROOT/.dev-pids"

# 确保 PID 目录存在
mkdir -p "$PID_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# 清理所有开发进程
cleanup_dev_processes() {
    log_info "清理开发进程..."
    
    # 终止 turbo 守护进程
    pkill -f "turbo.*daemon" 2>/dev/null || true
    
    # 终止所有 turbo dev
    pkill -f "turbo dev" 2>/dev/null || true
    
    # 终止 next 相关进程
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true
    
    # 终止 nest 相关进程
    pkill -f "nest start" 2>/dev/null || true
    
    # 等待进程退出
    sleep 1
    
    # 强制终止残留进程
    pkill -9 -f "turbo dev" 2>/dev/null || true
    pkill -9 -f "next dev" 2>/dev/null || true
    pkill -9 -f "next-server" 2>/dev/null || true
    pkill -9 -f "nest start" 2>/dev/null || true
    
    # 清理 turbo daemon stale PIDs
    rm -rf /var/folders/zr/*/T/turbod/* 2>/dev/null || true
    
    # 清理本地 PID 文件
    rm -f "$PID_DIR"/*.pid 2>/dev/null || true
    
    log_info "清理完成"
}

# 检查端口是否被占用 (返回 0 表示有端口被占用)
check_ports() {
    local ports_in_use=0
    
    for port in 3000 3001 3002; do
        if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
            log_warn "端口 $port 被占用"
            ports_in_use=1
        fi
    done
    
    # 返回 0 表示有端口被占用（shell 中 0 是 true）
    if [ $ports_in_use -eq 1 ]; then
        return 0
    else
        return 1
    fi
}


# 启动开发服务器
start_dev() {
    log_info "启动开发服务器..."
    
    # 先清理
    cleanup_dev_processes
    
    # 检查端口
    if check_ports; then
        log_error "端口被占用，无法启动"
        return 1
    fi
    
    # 进入项目目录
    cd "$PROJECT_ROOT"
    
    # 使用 turbo 启动（turbo 会管理所有子任务）
    # 使用 exec 确保信号正确传递
    log_info "启动 turbo dev (按 Ctrl+C 优雅停止)..."
    exec npx turbo dev
}

# 在后台启动
start_background() {
    log_info "在后台启动开发服务器..."
    
    cleanup_dev_processes
    
    if check_ports; then
        log_error "端口被占用"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    
    # 使用 nohup 在后台运行，并记录 PID
    nohup npx turbo dev > "$PID_DIR/turbo.log" 2>&1 &
    local turbo_pid=$!
    echo $turbo_pid > "$PID_DIR/turbo.pid"
    
    log_info "Turbo 已在后台启动 (PID: $turbo_pid)"
    log_info "日志: $PID_DIR/turbo.log"
    log_info "停止: ./scripts/dev.sh stop"
}

# 停止服务
stop_dev() {
    log_info "停止开发服务器..."
    cleanup_dev_processes
    log_info "服务已停止"
}

# 显示状态
show_status() {
    echo "=== MGMT V2 开发服务器状态 ==="
    echo ""
    
    # 检查进程
    echo "运行中的进程:"
    ps aux | grep -E "(turbo|next|nest)" | grep -v grep || echo "  (无)"
    echo ""
    
    # 检查端口
    echo "端口状态:"
    for port in 3000 3001 3002; do
        if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
            local pid=$(lsof -i ":$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
            echo "  端口 $port: 占用 (PID: $pid)"
        else
            echo "  端口 $port: 空闲"
        fi
    done
    echo ""
    
    # 检查 PID 文件
    if [ -f "$PID_DIR/turbo.pid" ]; then
        local stored_pid=$(cat "$PID_DIR/turbo.pid")
        if ps -p $stored_pid >/dev/null 2>&1; then
            echo "Turbo PID: $stored_pid (运行中)"
        else
            echo "Turbo PID: $stored_pid (已停止 - stale)"
        fi
    fi
}

# 主入口
case "${1:-start}" in
    start)
        start_dev
        ;;
    bg|background)
        start_background
        ;;
    stop)
        stop_dev
        ;;
    restart)
        stop_dev
        sleep 2
        start_dev
        ;;
    status)
        show_status
        ;;
    cleanup|clean)
        cleanup_dev_processes
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|bg|cleanup}"
        echo ""
        echo "  start    - 前台启动开发服务器 (Ctrl+C 停止)"
        echo "  bg       - 后台启动开发服务器"
        echo "  stop     - 停止所有开发进程"
        echo "  restart  - 重启开发服务器"
        echo "  status   - 显示状态"
        echo "  cleanup  - 清理所有开发进程"
        exit 1
        ;;
esac
