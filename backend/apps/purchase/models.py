from django.db import models
from django.utils import timezone

class Supplier(models.Model):
    """
    供应商表 (in_supplier)
    """
    supplier_code = models.CharField(
        max_length=2, 
        unique=True, 
        verbose_name="供应商代号",
        help_text="两个字母，不可重复"
    )
    supplier_name = models.CharField(
        max_length=100,
        verbose_name="供应商名称",
        help_text="请输入供货商名字"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'in_supplier'
        verbose_name = '供应商'
        verbose_name_plural = '供应商管理'

    def __str__(self):
        return f"{self.supplier_code} - {self.supplier_name}"


class SupplierStrategy(models.Model):
    """
    供应商策略表 (in_supplier_strategy)
    """
    CATEGORY_CHOICES = (
        ('E', '汽配'),
        ('A', '亚马逊'),
    )
    TYPE_CHOICES = (
        ('A', '电商货物供应商'),
        ('B', '货物依赖品供应商'),
        ('C', '耗材和其他供应商'),
    )
    CURRENCY_CHOICES = (
        ('RMB', 'RMB'),
        ('USD', 'USD'),
    )

    supplier = models.ForeignKey(
        Supplier, 
        on_delete=models.CASCADE, 
        to_field='supplier_code', 
        db_column='supplier_code',
        verbose_name="供应商代号"
    )
    category = models.CharField(
        max_length=1, 
        choices=CATEGORY_CHOICES, 
        verbose_name="供应商类别",
        help_text="E=汽配, A=亚马逊"
    )
    type = models.CharField(
        max_length=1,
        choices=TYPE_CHOICES,
        verbose_name="供应商种类",
        help_text="A=电商货物, B=货物依赖品, C=耗材和其他",
        null=True,
        blank=True
    )
    currency = models.CharField(
        max_length=3, 
        choices=CURRENCY_CHOICES, 
        verbose_name="收货货币"
    )
    float_currency = models.BooleanField(
        default=False, 
        verbose_name="货币是否浮动"
    )
    float_threshold = models.FloatField(
        default=0.0, 
        verbose_name="浮动阈值",
        help_text="汇率波动超过此值触发浮动规则 (0-10%)"
    )
    depository = models.BooleanField(
        default=False, 
        verbose_name="是否需要定金"
    )
    deposit_par = models.FloatField(
        default=0.0, 
        verbose_name="定金百分比",
        help_text="0-100"
    )
    status = models.BooleanField(
        default=True, 
        verbose_name="状态",
        help_text="True=Active, False=Inactive"
    )
    effective_date = models.DateField(
        default=timezone.now,
        verbose_name="生效日期"
    )
    note = models.TextField(
        default="默认策略",
        verbose_name="备注",
        blank=True
    )
    by = models.CharField(
        max_length=50,
        default="system",
        verbose_name="操作人",
        blank=True
    )

    def contract_upload_path(instance, filename):
        # Format: backup/supplier_contract/<code >/<YYYYMMDD>
        date_str = instance.effective_date.strftime('%Y%m%d')
        # instance.supplier is a FK, need code. 
        # CAUTION: If supplier object not fetched, instance.supplier_id might be used or instance.supplier.supplier_code
        # Since 'supplier' is FK to 'supplier_code', instance.supplier_id IS the code.
        return f"backup/supplier_contract/{instance.supplier_id}/{date_str}/{filename}"

    contract_file = models.FileField(
        upload_to=contract_upload_path,
        verbose_name="合同文件",
        blank=True,
        null=True
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'in_supplier_strategy'
        verbose_name = '供应商策略'
        verbose_name_plural = '供应商策略管理'

    def __str__(self):
        return f"{self.supplier_code} Strategy ({self.effective_date})"
