# File Path: backend/legacy_bridge/models.py
"""
文件说明: 遗留系统数据模型桥接 (Legacy Data Models)
主要功能:
1. 映射现有的 `User_Account` 表，使其能在 Django ORM 中被只读访问。
2. 为数据同步脚本提供源头数据结构。
"""

from django.db import models


class LegacyUser(models.Model):
    """
    [桥接模型] 映射 MySQL 中的 `User_Account` 表
    注意: managed = False 表示 Django 不会尝试创建或修改这张表，仅做读取。
    """
    # 对应原表: id INT AUTO_INCREMENT PRIMARY KEY
    id = models.AutoField(primary_key=True)

    # 对应原表: username VARCHAR(64)
    username = models.CharField(max_length=64, unique=True)

    # 对应原表: password_hash VARCHAR(255)
    # Django 默认也使用 PBKDF2，格式正好兼容
    password_hash = models.CharField(max_length=255)

    # 对应原表: is_admin TINYINT(1)
    is_admin = models.BooleanField(default=False)

    # 对应原表: is_locked TINYINT(1)
    is_locked = models.BooleanField(default=False)

    # 对应原表: failed_attempts INT
    failed_attempts = models.IntegerField(default=0)

    # 对应原表: created_at / updated_at
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # [核心] 指向真实的物理表名
        db_table = 'User_Account'
        # [核心] 告诉 Django 不要管理这张表的结构变更 (Migrate)
        managed = False
        verbose_name = '旧系统用户'
        verbose_name_plural = '旧系统用户表'

    def __str__(self):
        return f"{self.username} (Admin: {self.is_admin})"