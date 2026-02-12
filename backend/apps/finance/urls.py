# File: backend/apps/finance/urls.py
"""
财务板块路由配置
"""
from django.urls import path
from . import views
from .views import logistic
from .views import payment
from .views import prepay
from .views import deposit
from .views import po
from .views import flow

app_name = 'finance'

urlpatterns = [
    # Hub
    path('', views.finance_hub, name='hub'),
    
    # 定发收总预览
    path('flow/', flow.flow_page, name='flow_page'),
    path('flow/api/list/', flow.flow_list_api, name='flow_list'),
    path('flow/api/detail/', flow.flow_detail_api, name='flow_detail'),
    
    # 物流财务管理
    path('logistic/', logistic.logistic_page, name='logistic_page'),
    path('logistic/api/list/', logistic.logistic_list_api, name='logistic_list_api'),
    
    # 厂商预付款管理
    path('prepay/', prepay.prepay_page, name='prepay_page'),
    path('prepay/api/balances/', prepay.supplier_balance_api, name='prepay_balances'),
    path('prepay/api/transactions/', prepay.transaction_list_api, name='prepay_transactions'),
    path('prepay/api/submit/', prepay.submit_prepay_api, name='prepay_submit'),
    path('prepay/api/history/', prepay.prepay_history_api, name='prepay_history'),
    path('prepay/api/delete/', prepay.prepay_delete_api, name='prepay_delete'),
    path('prepay/api/restore/', prepay.prepay_restore_api, name='prepay_restore'),

    path('prepay/api/file_info/', prepay.prepay_file_info_api, name='prepay_file_info'),
    path('prepay/api/serve_file/', prepay.prepay_serve_file_api, name='prepay_serve_file'),
    path('prepay/api/upload_file/', prepay.prepay_upload_file_api, name='prepay_upload_file'),
    path('prepay/api/delete_file/', prepay.prepay_delete_file_api, name='prepay_delete_file'),
    path('prepay/api/rate/', prepay.prepay_rate_api, name='prepay_rate'),
    
    # 定金付款管理
    path('deposit/', deposit.deposit_page, name='deposit_page'),
    path('deposit/api/list/', deposit.deposit_list_api, name='deposit_list'),
    path('deposit/api/submit/', deposit.deposit_payment_submit, name='deposit_payment_submit'),
    path('deposit/api/upload_receipt/', deposit.deposit_receipt_upload_api, name='deposit_receipt_upload'),
    path('deposit/api/vendor_balance/', deposit.get_vendor_balance_api, name='deposit_vendor_balance'),
    path('deposit/api/files/', deposit.deposit_file_list_api, name='deposit_file_list'),
    path('deposit/api/serve_file/', deposit.deposit_file_serve_api, name='deposit_file_serve'),
    path('deposit/api/delete_file/', deposit.deposit_file_delete_api, name='deposit_file_delete'),
    path('deposit/api/orders/', deposit.deposit_orders_api, name='deposit_orders'),
    path('deposit/api/history/', deposit.deposit_history_api, name='deposit_history'),
    path('deposit/api/delete/', deposit.deposit_payment_delete_api, name='deposit_payment_delete'),
    
    # 订单付款管理
    path('po/', po.po_page, name='po_page'),
    path('po/api/list/', po.po_list_api, name='po_list'),
    path('po/api/submit/', po.po_payment_submit, name='po_payment_submit'),
    path('po/api/upload_receipt/', po.po_receipt_upload_api, name='po_receipt_upload'),
    path('po/api/vendor_balance/', po.get_vendor_balance_api, name='po_vendor_balance'),
    path('po/api/files/', po.po_file_list_api, name='po_file_list'),
    path('po/api/serve_file/', po.po_file_serve_api, name='po_file_serve'),
    path('po/api/delete_file/', po.po_file_delete_api, name='po_file_delete'),
    path('po/api/orders/', po.po_orders_api, name='po_orders'),
    path('po/api/history/', po.po_history_api, name='po_history'),
    path('po/api/delete/', po.po_payment_delete_api, name='po_payment_delete'),
    
    # 物流付款API
    path('logistic/api/submit_payment/', payment.submit_payment_api, name='logistic_submit_payment'),
    path('logistic/api/delete_payment/', payment.delete_payment_api, name='logistic_delete_payment'),
    path('logistic/api/restore_payment/', payment.restore_payment_api, name='logistic_restore_payment'),
    
    # 付款文件管理API
    path('logistic/api/check_payment_files/', payment.check_payment_files_api, name='check_payment_files'),
    path('logistic/api/get_payment_files/', payment.get_payment_files_api, name='get_payment_files'),
    path('logistic/api/upload_payment_file/', payment.upload_payment_file_api, name='upload_payment_file'),
    path('logistic/api/serve_payment_file/', payment.serve_payment_file_api, name='serve_payment_file'),
    path('logistic/api/delete_payment_file/', payment.delete_payment_file_api, name='delete_payment_file'),
    path('logistic/api/payment_history/', payment.payment_history_api, name='payment_history'),
    path('logistic/api/payment_orders/', payment.payment_orders_api, name='payment_orders'),

]
