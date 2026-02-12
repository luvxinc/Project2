import re
from django import forms
from django.utils.translation import gettext_lazy as _
from .models import Supplier, SupplierStrategy

class SupplierForm(forms.ModelForm):
    class Meta:
        model = Supplier
        fields = ['supplier_code', 'supplier_name']

    def clean_supplier_code(self):
        code = self.cleaned_data.get('supplier_code', '').upper()
        if not re.match(r'^[A-Z]{2}$', code):
            raise forms.ValidationError(_("供应商代号必须是两个英文字母"))
        
        if Supplier.objects.filter(supplier_code=code).exists():
            raise forms.ValidationError(_("供应商代号 '{code}' 已存在").format(code=code))
        
        return code

class SupplierStrategyForm(forms.ModelForm):
    class Meta:
        model = SupplierStrategy
        fields = [
            'category', 'type', 'currency', 
            'float_currency', 'float_threshold', 
            'depository', 'deposit_par',
            'status', 'effective_date', 'note', 'contract_file'
        ]
    
    # Type field with choices
    type = forms.ChoiceField(
        choices=[('', '请选择'), ('A', '电商货物供应商'), ('B', '货物依赖品供应商'), ('C', '耗材和其他供应商')],
        required=False
    )

    # Explicitly set required=False for conditional fields
    float_threshold = forms.FloatField(required=False, initial=0.0)
    deposit_par = forms.FloatField(required=False, initial=0.0)
    effective_date = forms.DateField(required=False)
    contract_file = forms.FileField(required=False)
    # Note is textfield, blank=True in model implies required=False in form usually, but to be safe:
    note = forms.CharField(widget=forms.Textarea, required=False)

    def clean(self):
        cleaned_data = super().clean()
        float_currency = cleaned_data.get('float_currency')
        float_threshold = cleaned_data.get('float_threshold')
        depository = cleaned_data.get('depository')
        deposit_par = cleaned_data.get('deposit_par')

        # Logic: If float_currency is True, float_threshold is required
        if float_currency:
            if float_threshold is None or float_threshold <= 0:
                 self.add_error('float_threshold', _("开启 [价格浮动] 时，必须设置有效的浮动阈值 (大于 0)"))
            elif float_threshold > 10:
                 self.add_error('float_threshold', _("价格浮动阈值不能超过 10%"))
        
        if depository:
            if deposit_par is None or deposit_par <= 0:
                self.add_error('deposit_par', _("开启 [要求定金] 时，必须设置有效的定金百分比 (大于 0)"))
        
        return cleaned_data
