# core/services/report_manager.py
"""
文件说明: 报表文件管理器 (Report File Manager)
主要功能:
1. 管理 output/ 目录下的报表文件。
2. 实现用户隔离：根据当前登录用户操作对应的子目录。
3. 提供文件列表查询、清空、ZIP 打包下载功能。
4. [Security] 防止目录遍历攻击，确保文件名安全。
"""

import os
import re
import shutil
import zipfile
from io import BytesIO
from typing import List, Optional
from pathlib import Path

from backend.common.settings import settings
from core.sys.context import get_current_user


class ReportFileManager:
    """
    用户隔离的报表文件管理器。
    每个用户的文件存储在 output/{username}/ 目录下，确保并发安全。
    """

    def __init__(self):
        # [核心] 动态定位用户目录
        user = get_current_user()
        # 清洗用户名，只保留字母数字和下划线，防止目录遍历
        sub_dir = self._sanitize_username(user) if user and user != "System" else "default"

        self.output_dir = settings.OUTPUT_DIR / sub_dir

        if not self.output_dir.exists():
            self.output_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _sanitize_username(username: str) -> str:
        """清洗用户名，只保留安全字符"""
        # 只保留字母、数字、下划线，其他替换为下划线
        sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', str(username))
        # 确保不为空
        return sanitized if sanitized else "unknown"

    def _validate_filename(self, filename: str) -> bool:
        """验证文件名是否安全（无目录遍历）"""
        # 禁止路径分隔符和相对路径符号
        if '..' in filename or '/' in filename or '\\' in filename:
            return False
        # 只允许 .csv 文件
        if not filename.lower().endswith('.csv'):
            return False
        return True

    def get_generated_files(self) -> List[str]:
        """获取所有生成的 CSV 文件名"""
        if not self.output_dir.exists():
            return []
        # 按修改时间倒序排列
        files = [f for f in os.listdir(self.output_dir) if f.lower().endswith('.csv')]
        files.sort(key=lambda x: os.path.getmtime(os.path.join(self.output_dir, x)), reverse=True)
        return files

    def get_file_path(self, filename: str) -> Path:
        """获取绝对路径（带安全验证）"""
        if not self._validate_filename(filename):
            raise ValueError(f"Invalid filename: {filename}")
        return self.output_dir / filename

    def clear_all_reports(self) -> None:
        """清空当前用户的输出目录"""
        for filename in os.listdir(self.output_dir):
            file_path = self.output_dir / filename
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")

    def create_zip_archive(self, file_list: Optional[List[str]] = None) -> bytes:
        """将文件打包为 ZIP 字节流 (用于下载)"""
        buffer = BytesIO()
        target_files = file_list if file_list is not None else self.get_generated_files()

        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in target_files:
                fpath = self.output_dir / fname
                if fpath.exists():
                    zf.write(fpath, arcname=fname)

        return buffer.getvalue()