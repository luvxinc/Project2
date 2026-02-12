# File: backend/apps/locking/views.py
"""
# ==============================================================================
# 模块名称: 分布式锁 API 视图 (Locking Views)
# ==============================================================================
#
# [Purpose / 用途]
# 提供标准的 RESTful API 用于资源的"抢占 (Acquire)"与"释放 (Release)"。
#
# [Architecture / 架构]
# - Protocol: REST (POST/GET) + WebDAV Concepts (423 Locked).
# - Logic:
#     - Acquire: Insert (Unique Key) or Refresh (if owned).
#     - Release: Delete (owner check).
#
# [ISO Compliance / 合规性]
# - 互斥性: 强一致性保证同一时刻只有一个用户持有资源锁。
#
# ==============================================================================
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import IntegrityError
from .models import SystemLock


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def acquire_lock(request):
    """
    [API] 申请锁
    Payload: { "resource_key": "Data_Transaction", "module": "ETL" }
    """
    key = request.data.get('resource_key')
    module = request.data.get('module', 'Unknown')
    user = request.user.username  # 从 Auth Token 获取当前用户

    if not key:
        return Response({"status": "error", "message": "Missing resource_key"}, status=400)

    try:
        # 1. 尝试直接创建锁 (利用数据库主键唯一性)
        SystemLock.objects.create(
            resource_key=key,
            locked_by=user,
            module_name=module,
            locked_at=timezone.now()
        )
        return Response({"status": "success", "message": "Lock acquired"})

    except IntegrityError:
        # 2. 锁已存在，检查是否属于自己
        try:
            current_lock = SystemLock.objects.get(resource_key=key)

            if current_lock.locked_by == user:
                # 是自己的锁 -> 刷新时间 (心跳)
                current_lock.locked_at = timezone.now()
                current_lock.module_name = module  # 更新当前操作模块
                current_lock.save()
                return Response({"status": "success", "message": "Lock refreshed"})
            else:
                # 是别人的锁 -> 抢占失败
                return Response({
                    "status": "locked",
                    "message": f"Resource is locked by {current_lock.locked_by}",
                    "locked_by": current_lock.locked_by,
                    "locked_at": current_lock.locked_at
                }, status=423)  # 423 Locked WebDAV standard

        except SystemLock.DoesNotExist:
            # 极低概率：刚才插入失败说有锁，现在查又没了（并发间隙被释放了）
            # 递归重试一次即可
            return acquire_lock(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def release_lock(request):
    """
    [API] 释放锁
    Payload: { "resource_key": "Data_Transaction" }
    """
    key = request.data.get('resource_key')
    user = request.user.username

    try:
        lock = SystemLock.objects.get(resource_key=key)

        # 只能释放自己的锁
        if lock.locked_by == user:
            lock.delete()
            return Response({"status": "success", "message": "Lock released"})
        else:
            return Response({
                "status": "error",
                "message": f"Cannot release lock owned by {lock.locked_by}"
            }, status=403)

    except SystemLock.DoesNotExist:
        # 锁本来就不在，也算释放成功
        return Response({"status": "success", "message": "Lock already released"})


@api_view(['GET'])
def check_lock(request, key):
    """
    [API] 检查锁状态 (无需鉴权，用于UI展示状态)
    """
    try:
        lock = SystemLock.objects.get(resource_key=key)
        return Response({
            "is_locked": True,
            "locked_by": lock.locked_by,
            "module": lock.module_name,
            "locked_at": lock.locked_at
        })
    except SystemLock.DoesNotExist:
        return Response({"is_locked": False})