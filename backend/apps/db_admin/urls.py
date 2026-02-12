from django.urls import path
from . import views

app_name = 'db_admin'

urlpatterns = [
    path('', views.dashboard_view, name='dashboard'),
    
    # Sub-Pages (子路由页面)
    path('backup/', views.backup_page, name='backup'),
    path('restore/', views.restore_page, name='restore'),
    path('manage/', views.manage_page, name='manage'),
    path('clean/', views.clean_page, name='clean'),
    
    
    path('data_change/', views.data_change_view, name='data_change'),
    
    # Wizard Endpoints (Inventory)
    path('data_change/wizard/step2/', views.wizard_step_2, name='wizard_step_2'),
    path('data_change/wizard/step3/', views.wizard_step_3_form, name='wizard_step_3'),
    path('data_change/execute/inventory/', views.execute_inventory_update, name='execute_inventory_update'),
    path('data_change/execute/drop_col/', views.execute_column_delete, name='execute_column_delete'),
    path('data_change/api/get_sku_val/', views.get_sku_current_val, name='get_sku_val'),

    # COGS Endpoints
    path('data_change/cogs/load/', views.cogs_load_table, name='cogs_load_table'),
    path('data_change/cogs/load_only/', views.cogs_load_table_only, name='cogs_load_table_only'),
    path('data_change/cogs/update/', views.cogs_batch_update, name='cogs_batch_update'),
    path('data_change/cogs/create/', views.cogs_create_skus, name='cogs_create_skus'),
    path('data_change/cogs/form/', views.cogs_get_form, name='cogs_get_form'),
    path('data_change/cogs/form_only/', views.cogs_get_form_only, name='cogs_get_form_only'),

    # Backup Actions
    path('action/backup/', views.create_backup, name='create_backup'),
    path('action/restore/', views.restore_backup, name='restore_backup'),
    path('action/delete_backup/', views.delete_backup, name='delete_backup'),
    path('action/batch_delete_backups/', views.batch_delete_backups, name='batch_delete_backups'),
    path('action/clean_data/', views.clean_data, name='clean_data'),
    path('action/clean_verify/', views.clean_verify, name='clean_verify'),
]

