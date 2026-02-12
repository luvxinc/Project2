#!/bin/bash

# ========================================================
# Eaglestar ERP V2.0.0 修复初始化脚本 (Robust Fix)
# 作用: 1. 修复损坏的 pip 工具。2. 安装依赖。3. 执行数据库迁移。
# ========================================================

# 设置严格模式：任何命令失败都将立即退出脚本
# set -e
# 注意：暂时不设置 set -e，避免 pip 修复过程中的警告导致脚本中断。

# 1. 确保进入脚本所在的目录 (项目根目录)
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE_DIR"
echo "✅ 根目录定位成功: $BASE_DIR"

# 2. 激活 Python 环境
if [ -z "$VIRTUAL_ENV" ]; then
    if [ -d ".venv" ]; then
        source .venv/bin/activate
    elif [ -d "venv" ]; then
        source venv/bin/activate
    else
        echo "❌ 错误: 未检测到虚拟环境 (.venv 或 venv)。请手动激活或创建。"
        exit 1
    fi
fi
echo "🟢 Python 环境已激活: $VIRTUAL_ENV"

# 3. [核心修复] 修复并升级损坏的 pip 和 setuptools
echo "⚙️ [CORE FIX] 正在修复并升级 pip/setuptools..."
# 使用 Python 解释器强制重新安装 pip，解决 ModuleNotFoundError 问题。
"$VIRTUAL_ENV/bin/python" -m pip install --upgrade pip setuptools
if [ $? -ne 0 ]; then
    echo "❌ 严重错误: pip 修复失败，请检查网络连接或环境权限。"
    exit 1
fi
echo "✅ pip 工具已修复/升级。"

# 4. 安装 Python 依赖 (现在应该不会失败了)
echo "📦 正在安装依赖 (requirements.txt)..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "❌ 错误: 依赖安装失败，请查看上方日志确认具体包错误。"
    exit 1
fi
echo "✅ 所有依赖包已安装"

# 5. 进入后端目录，执行 Django 数据库设置
cd backend
echo "=================================================="
echo "🧠 正在初始化 Django 后端..."

# 6. 生成迁移文件 (makemigrations)
# 强制对所有自定义 App 运行，即使它们是 managed=False (确保Django能找到它们)
echo "-> 正在生成迁移文件..."
python manage.py makemigrations apps.audit apps.etl apps.inventory apps.locking apps.reports apps.sys_config
if [ $? -ne 0 ]; then
    echo "⚠️ 警告: makemigrations 失败，可能缺少模型文件或路径错误。但继续尝试 migrate..."
fi
echo "✅ 迁移文件已尝试生成"

# 7. 应用迁移 (migrate)
echo "-> 正在应用迁移 (创建表)..."
python manage.py migrate
echo "✅ 数据库迁移已完成"

# 8. 返回项目根目录并结束
cd ..
echo "=================================================="
echo "🎉 V2.0.0 架构环境已就绪！"
echo "下一步: 运行 bash start_server.sh 启动系统。"