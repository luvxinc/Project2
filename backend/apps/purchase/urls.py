"""
采购板块路由配置
Structure: /dashboard/purchase/{feature}/
"""
from django.urls import path
from . import views

app_name = 'purchase'

urlpatterns = [
    # Module Hub
    path('', views.purchase_hub, name='hub'),

    # ===========================================
    # 独立页面路由（路由下沉）
    # ===========================================
    
    # 新增供应商页面
    path('add/', views.supplier_add_page, name='supplier_add_page'),
    
    # 供应商管理页面
    path('strategy/', views.supplier_strategy_page, name='supplier_strategy_page'),
    
    # 新建采购订单页面
    path('new_po/', views.po_add_page, name='po_add_page'),

    # ===========================================
    # API 路由（供应商相关）
    # ===========================================
    
    # 新增供应商接口 (POST)
    path('api/supplier/add/', views.add_supplier, name='supplier_add'),
    
    # 供应商代号校验接口 (GET) - Step2前端校验用
    path('api/supplier/code-exists/', views.check_supplier_code_exists, name='supplier_code_check'),
    
    # 供应商列表接口 (GET)
    path('api/supplier/list/', views.supplier_list_api, name='supplier_list'),
    
    # 修改策略接口 (POST)
    path('api/strategy/modify/', views.modify_supplier_strategy, name='supplier_strategy_modify'),
    
    # 策略日期冲突检查接口 (GET) - Step2覆盖确认用
    path('api/strategy/check-conflict/', views.check_strategy_date_conflict, name='strategy_date_conflict_check'),
    
    # 查看合同接口 (GET)
    path('api/contract/<int:strategy_id>/', views.view_contract_file, name='supplier_contract_view'),
    
    # ===========================================
    # 采购订单 API 路由
    # ===========================================
    
    # 获取供应商列表（用于PO创建）
    path('api/po/suppliers/', views.supplier_list_for_po_api, name='po_supplier_list'),
    
    # 获取供应商策略信息（根据日期）
    path('api/po/strategy/', views.supplier_strategy_for_po_api, name='po_supplier_strategy'),
    
    # 获取汇率
    path('api/po/exchange-rate/', views.get_exchange_rate_api, name='po_exchange_rate'),
    
    # 验证订单合同参数
    path('api/po/validate-params/', views.validate_po_params_api, name='po_validate_params'),
    
    # 验证订单商品数据
    path('api/po/validate-items/', views.validate_po_items_api, name='po_validate_items'),
    
    # 提交采购订单
    path('api/po/submit/', views.submit_po_api, name='po_submit'),
    
    # 下载采购订单模板
    path('api/po/template/', views.download_po_template_api, name='po_template_download'),
    
    # 解析上传的Excel文件
    path('api/po/parse-excel/', views.parse_po_excel_api, name='po_parse_excel'),
    
    # 生成预填并锁定的模板
    path('api/po/generate-template/', views.generate_prefilled_template_api, name='po_generate_template'),

    # ===========================================
    # 订单管理路由
    # ===========================================
    
    # 订单管理主页面
    path('po_mgmt/', views.po_mgmt_page, name='po_mgmt_page'),
    
    # 订单管理 API
    path('api/po_mgmt/list/', views.po_list_api, name='po_mgmt_list'),
    path('api/po_mgmt/suppliers/', views.supplier_list_for_filter_api, name='po_mgmt_suppliers'),
    path('api/po_mgmt/detail/', views.po_detail_api, name='po_mgmt_detail'),
    path('api/po_mgmt/download/', views.download_po_excel_api, name='po_mgmt_download'),
    path('api/po_mgmt/history/', views.get_po_history_api, name='po_mgmt_history'),
    path('api/po_mgmt/edit_data/', views.get_po_for_edit_api, name='po_mgmt_edit_data'),
    path('api/po_mgmt/sku_list/', views.get_sku_list_api, name='po_mgmt_sku_list'),
    path('api/po_mgmt/submit_modify/', views.submit_po_modification_api, name='po_mgmt_submit_modify'),
    path('api/po_mgmt/submit_delete/', views.submit_po_delete_api, name='po_mgmt_submit_delete'),
    path('api/po_mgmt/submit_undelete/', views.submit_po_undelete_api, name='po_mgmt_submit_undelete'),
    path('api/po_mgmt/upload_invoice/', views.upload_po_invoice_api, name='po_mgmt_upload_invoice'),
    path('api/po_mgmt/invoice_info/', views.get_po_invoice_info_api, name='po_mgmt_invoice_info'),
    path('api/po_mgmt/serve_invoice/', views.serve_po_invoice_file_api, name='po_mgmt_serve_invoice'),
    path('api/po_mgmt/delete_invoice/', views.delete_po_invoice_api, name='po_mgmt_delete_invoice'),

    # ===========================================
    # 发货单路由
    # ===========================================
    
    # 新建发货单页面
    path('new_send/', views.send_add_page, name='send_add_page'),
    
    # 发货单 API
    path('api/send/check_availability/', views.check_send_availability_api, name='send_check_availability'),
    path('api/send/generate_template_data/', views.generate_template_data_api, name='send_generate_template_data'),
    path('api/send/check_logistic/', views.check_logistic_num_exists_api, name='send_check_logistic'),
    path('api/send/po_list/', views.get_po_list_for_send_api, name='send_po_list'),
    path('api/send/po_items/', views.get_po_items_for_send_api, name='send_po_items'),
    path('api/send/validate_logistics/', views.validate_send_logistics_api, name='send_validate_logistics'),
    path('api/send/validate_items/', views.validate_send_items_api, name='send_validate_items'),
    path('api/send/submit/', views.submit_send_api, name='send_submit'),
    path('api/send/download_template/', views.download_send_template_api, name='send_download_template'),
    path('api/send/validate_excel/', views.validate_send_excel_api, name='send_validate_excel'),
    
    # ===========================================
    # 发货单管理路由
    # ===========================================
    
    # 发货单管理主页面
    path('send_mgmt/', views.send_mgmt_page, name='send_mgmt_page'),
    
    # 发货单管理 API
    path('api/send_mgmt/list/', views.send_list_api, name='send_mgmt_list'),
    path('api/send_mgmt/logistics/', views.logistic_list_for_filter_api, name='send_mgmt_logistics'),
    path('api/send_mgmt/detail/', views.send_detail_api, name='send_mgmt_detail'),
    path('api/send_mgmt/download/', views.download_send_excel_api, name='send_mgmt_download'),
    path('api/send_mgmt/history/', views.get_send_history_api, name='send_mgmt_history'),
    path('api/send_mgmt/edit_data/', views.get_send_for_edit_api, name='send_mgmt_edit_data'),
    path('api/send_mgmt/sku_list/', views.get_sku_list_api, name='send_mgmt_sku_list'),
    path('api/send_mgmt/submit_modify/', views.submit_send_modification_api, name='send_mgmt_submit_modify'),
    path('api/send_mgmt/submit_delete/', views.submit_send_delete_api, name='send_mgmt_submit_delete'),
    path('api/send_mgmt/submit_undelete/', views.submit_send_undelete_api, name='send_mgmt_submit_undelete'),
    path('api/send_mgmt/upload_invoice/', views.upload_send_invoice_api, name='send_mgmt_upload_invoice'),
    path('api/send_mgmt/invoice_info/', views.get_send_invoice_info_api, name='send_mgmt_invoice_info'),
    path('api/send_mgmt/serve_invoice/', views.serve_send_invoice_file_api, name='send_mgmt_serve_invoice'),
    path('api/send_mgmt/delete_invoice/', views.delete_send_invoice_api, name='send_mgmt_delete_invoice'),
    # 货物明细编辑 API
    path('api/send_mgmt/items_for_edit/', views.get_items_for_edit_api, name='send_mgmt_items_for_edit'),
    path('api/send_mgmt/available_po_list/', views.get_available_po_list_api, name='send_mgmt_available_po_list'),
    path('api/send_mgmt/available_sku_list/', views.get_available_sku_list_api, name='send_mgmt_available_sku_list'),
    path('api/send_mgmt/available_price_list/', views.get_available_price_list_api, name='send_mgmt_available_price_list'),
    path('api/send_mgmt/submit_items_modify/', views.submit_items_modification_api, name='send_mgmt_submit_items_modify'),

    # ===========================================
    # 货物入库路由
    # ===========================================
    
    # 货物入库页面
    path('receive/', views.receive_page, name='receive_page'),
    
    # 货物入库 API
    path('api/receive/pending_shipments/', views.get_pending_shipments_api, name='receive_pending_shipments'),
    path('api/receive/shipment_items/', views.get_shipment_items_api, name='receive_shipment_items'),
    path('api/receive/submit/', views.submit_receive_api, name='receive_submit'),
    
    # ===========================================
    # 入库管理路由
    # ===========================================
    
    # 入库管理页面
    path('receive_mgmt/', views.receive_mgmt_page, name='receive_mgmt_page'),
    
    # 入库管理 API
    path('api/receive_mgmt/list/', views.receive_list_api, name='receive_mgmt_list'),
    path('api/receive_mgmt/detail/', views.receive_detail_api, name='receive_mgmt_detail'),
    path('api/receive_mgmt/edit_submit/', views.receive_edit_submit_api, name='receive_mgmt_edit_submit'),
    path('api/receive_mgmt/history/', views.get_receive_history_api, name='receive_mgmt_history'),
    path('api/receive_mgmt/submit_delete/', views.submit_receive_delete_api, name='receive_mgmt_submit_delete'),
    path('api/receive_mgmt/submit_undelete/', views.submit_receive_undelete_api, name='receive_mgmt_submit_undelete'),
    path('api/receive_mgmt/upload_file/', views.upload_receive_file_api, name='receive_mgmt_upload_file'),
    path('api/receive_mgmt/file_info/', views.get_receive_file_info_api, name='receive_mgmt_file_info'),
    path('api/receive_mgmt/serve_file/', views.serve_receive_file_api, name='receive_mgmt_serve_file'),
    path('api/receive_mgmt/delete_file/', views.delete_receive_file_api, name='receive_mgmt_delete_file'),

    # ===========================================
    # 入库异常处理路由
    # ===========================================
    
    # 入库异常处理页面
    path('abnormal/', views.abnormal_page, name='abnormal_page'),
    
    # 入库异常处理 API
    path('api/abnormal/list/', views.abnormal_list_api, name='abnormal_list'),
    path('api/abnormal/detail/', views.abnormal_detail_api, name='abnormal_detail'),
    path('api/abnormal/process/', views.abnormal_process_api, name='abnormal_process'),
    path('api/abnormal/history/', views.abnormal_history_api, name='abnormal_history'),
    path('api/abnormal/delete/', views.abnormal_delete_api, name='abnormal_delete'),
]

