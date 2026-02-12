# File: backend/apps/audit/utils.py
import json
import os
import glob
from pathlib import Path
from datetime import datetime
from django.utils import timezone
from django.core import serializers
from django.apps import apps
from django.conf import settings
from .models import AuditLog

BACKUP_DIR = Path(settings.BASE_DIR).parent / 'backup' / 'goback'
RECALL_DIR = Path(settings.BASE_DIR).parent / 'backup' / 'goback_recall'

# Ensure directories exist
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
RECALL_DIR.mkdir(parents=True, exist_ok=True)

class AuditLogger:
    @staticmethod
    def log_business(request, action, target_model, target_id, status="Success", root_cause=None, details=None, note=None):
        """
        Logs a standard business operation.
        details: dict containing 'before' and 'after' or other info for 'changes' column.
        """
        user = request.user if request.user.is_authenticated else None
        actor_name = user.username if user else "Anonymous"
        ip = request.META.get('REMOTE_ADDR')
        
        # Determine Page Hierarchy (simplified for now, can be passed in request or details)
        page_hierarchy = details.get('page_hierarchy') if details else "Unknown"

        ref_id = f"REF_{int(datetime.now().timestamp() * 1000)}"
        
        if details and 'pk' in details:
             # Clean up details to not duplicate info if needed
             pass

        AuditLog.objects.create(
            ref_id=ref_id,
            actor=actor_name,
            ip_address=ip,
            page_hierarchy=page_hierarchy,
            target_app="UserAdmin", # Default/Placeholder, should be dynamic
            target_model=target_model,
            target_id=str(target_id),
            action=action,
            status=status,
            root_cause=root_cause,
            log_type="Regular",
            note=note,
            changes=details if details else {},
            timestamp=timezone.now()
        )
        return ref_id

    @staticmethod
    def log_permanent(request, action, note):
        """
        Logs a permanent action (e.g. Clear Logs).
        """
        user = request.user
        AuditLog.objects.create(
            ref_id=f"PERM_{int(datetime.now().timestamp())}",
            actor=user.username,
            ip_address=request.META.get('REMOTE_ADDR'),
            page_hierarchy="Audit > System",
            target_app="Audit",
            target_model="AuditLog",
            target_id="-",
            action=action,
            status="Success",
            log_type="Permanent",
            note=note,
            timestamp=timezone.now()
        )

class SnapshotManager:
    @staticmethod
    def create_snapshot(ref_id, model_name, app_label):
        """
        Creates a snapshot of the entire table for the given model.
        """
        try:
            Model = apps.get_model(app_label, model_name)
            data = serializers.serialize("json", Model.objects.all())
            
            filename = f"{ref_id}_{model_name}.json"
            filepath = BACKUP_DIR / filename
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(data)
            
            SnapshotManager._prune_snapshots()
            return str(filepath)
        except Exception as e:
            print(f"Snapshot failed: {e}")
            return None

    @staticmethod
    def restore_snapshot(filepath):
        """
        Restores data from a snapshot file.
        """
        if not os.path.exists(filepath):
            return False, "File not found"
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = f.read()
            
            for obj in serializers.deserialize("json", data):
                obj.save()
            return True, "Restored successfully"
        except Exception as e:
            return False, str(e)

    @staticmethod
    def _prune_snapshots():
        """
        Keeps only the last 10 snapshots or within 90 days.
        """
        files = sorted(BACKUP_DIR.glob('*.json'), key=os.path.getmtime, reverse=True)
        
        # Keep max 10
        for f in files[10:]:
            f.unlink()
        
        # TODO: Implement 90 days check if needed, but count limit usually suffices for now.
