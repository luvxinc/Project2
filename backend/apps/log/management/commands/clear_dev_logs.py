# File: backend/apps/log/management/commands/clear_dev_logs.py
"""
清理开发模式日志命令
在发布上线前执行，清除所有开发阶段产生的日志
"""
from django.core.management.base import BaseCommand

from backend.apps.log.models import LogError, LogAudit, LogBusiness, LogAccess


class Command(BaseCommand):
    help = '清除所有开发模式产生的日志（dev_mode=True）'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='确认执行删除（必须指定此参数才会实际删除）',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='模拟运行，显示将删除的数量但不实际删除',
        )
    
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        confirm = options['confirm']
        
        # 统计开发日志数量
        tables = [
            ('log_error', LogError),
            ('log_audit', LogAudit),
            ('log_business', LogBusiness),
            ('log_access', LogAccess),
        ]
        
        self.stdout.write("=" * 60)
        self.stdout.write("开发模式日志统计")
        self.stdout.write("=" * 60)
        
        total_dev_logs = 0
        stats = []
        
        for name, model in tables:
            dev_count = model.objects.filter(dev_mode=True).count()
            total_count = model.objects.count()
            stats.append((name, dev_count, total_count))
            total_dev_logs += dev_count
            
            pct = (dev_count / total_count * 100) if total_count > 0 else 0
            self.stdout.write(f"  {name}: {dev_count:,} / {total_count:,} ({pct:.1f}%)")
        
        self.stdout.write("=" * 60)
        self.stdout.write(f"  总计开发日志: {total_dev_logs:,} 条")
        self.stdout.write("")
        
        if total_dev_logs == 0:
            self.stdout.write(self.style.SUCCESS("没有开发模式日志需要清理"))
            return
        
        # 模拟运行 - 只显示信息
        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY RUN] 将删除 {total_dev_logs:,} 条开发日志"))
            self.stdout.write("使用 --confirm 参数执行实际删除")
            return
        
        # 需要确认
        if not confirm:
            self.stdout.write(self.style.WARNING(
                f"⚠️  这将删除 {total_dev_logs:,} 条开发模式日志！"
            ))
            self.stdout.write("")
            self.stdout.write("执行以下命令确认删除:")
            self.stdout.write("  python manage.py clear_dev_logs --confirm")
            self.stdout.write("")
            self.stdout.write("或使用 --dry-run 查看详情:")
            self.stdout.write("  python manage.py clear_dev_logs --dry-run")
            return
        
        # 执行删除
        self.stdout.write("正在删除开发日志...")
        
        deleted_total = 0
        for name, model in tables:
            count, _ = model.objects.filter(dev_mode=True).delete()
            deleted_total += count
            self.stdout.write(f"  {name}: 已删除 {count:,} 条")
        
        self.stdout.write("=" * 60)
        self.stdout.write(self.style.SUCCESS(f"✅ 共删除 {deleted_total:,} 条开发日志"))
        self.stdout.write("")
        self.stdout.write("提示: 现在可以将 LOG_DEV_MODE 设置为 false 进入生产模式")
