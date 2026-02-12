# File: backend/apps/log/management/commands/log_maintenance.py
"""
日志自动维护命令
定时执行，自动清理过期日志
"""
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from backend.apps.log.models import LogError, LogAudit, LogBusiness, LogAccess


class Command(BaseCommand):
    help = '日志自动维护：清理过期日志、归档历史数据'
    
    # 保留策略（天数）
    RETENTION_POLICY = {
        'log_access': 30,       # 访问日志保留 30 天
        'log_business': 90,     # 业务日志保留 90 天
        # log_error 和 log_audit 永久保留，不删除
    }
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='模拟运行，不实际删除',
        )
    
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()
        total_deleted = 0
        
        self.stdout.write(f"{'[DRY RUN] ' if dry_run else ''}开始日志维护 - {now.strftime('%Y-%m-%d %H:%M:%S')}")
        self.stdout.write("=" * 60)
        
        # 1. 清理 log_access（30 天）
        cutoff = now - timedelta(days=self.RETENTION_POLICY['log_access'])
        queryset = LogAccess.objects.filter(created_at__lt=cutoff)
        count = queryset.count()
        if not dry_run:
            queryset.delete()
        total_deleted += count
        self.stdout.write(f"  log_access: {'将删除' if dry_run else '已删除'} {count} 条 (超过 30 天)")
        
        # 2. 清理 log_business（90 天）
        cutoff = now - timedelta(days=self.RETENTION_POLICY['log_business'])
        queryset = LogBusiness.objects.filter(created_at__lt=cutoff)
        count = queryset.count()
        if not dry_run:
            queryset.delete()
        total_deleted += count
        self.stdout.write(f"  log_business: {'将删除' if dry_run else '已删除'} {count} 条 (超过 90 天)")
        
        # 3. log_error 和 log_audit 永久保留
        self.stdout.write(f"  log_error: 永久保留 (当前 {LogError.objects.count()} 条)")
        self.stdout.write(f"  log_audit: 永久保留 (当前 {LogAudit.objects.count()} 条)")
        
        # 4. 统计信息
        self.stdout.write("=" * 60)
        self.stdout.write(f"维护完成，共{'将删除' if dry_run else '删除'} {total_deleted} 条日志")
        
        # 5. 输出当前空间占用估算
        self._report_stats()
    
    def _report_stats(self):
        """输出当前日志统计信息"""
        stats = [
            ('log_error', LogError.objects.count()),
            ('log_audit', LogAudit.objects.count()),
            ('log_business', LogBusiness.objects.count()),
            ('log_access', LogAccess.objects.count()),
        ]
        
        self.stdout.write("\n当前日志统计:")
        total = 0
        for name, count in stats:
            total += count
            self.stdout.write(f"  {name}: {count:,} 条")
        self.stdout.write(f"  总计: {total:,} 条")
        
        # 估算空间（按平均每条 500 字节）
        estimated_size_mb = (total * 500) / (1024 * 1024)
        self.stdout.write(f"  估算空间: ~{estimated_size_mb:.1f} MB")
