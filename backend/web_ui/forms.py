# File: backend/web_ui/forms.py
"""
文件说明: Web UI 表单定义
主要功能:
1. 定义登录表单 (LoginForm)。
2. 配置字段的 CSS 样式 (Bootstrap + Glass UI)。
"""

from django import forms
from django.contrib.auth.forms import AuthenticationForm


class LoginForm(AuthenticationForm):
    """
    [登录表单]
    继承自 Django 原生 AuthenticationForm，保留了核心验证逻辑，
    但重写了 Widget 以适配我们的 Dark Glass UI。
    """
    username = forms.CharField(
        label="用户名",
        widget=forms.TextInput(attrs={
            'class': 'form-control form-control-lg bg-dark text-white border-secondary',
            'placeholder': '请输入账号',
            'autofocus': True,
            'style': 'background-color: rgba(0, 0, 0, 0.5) !important;'
        })
    )

    password = forms.CharField(
        label="密码",
        widget=forms.PasswordInput(attrs={
            'class': 'form-control form-control-lg bg-dark text-white border-secondary',
            'placeholder': '请输入密码',
            'style': 'background-color: rgba(0, 0, 0, 0.5) !important;'
        })
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 移除默认的 label 后缀
        self.label_suffix = ""