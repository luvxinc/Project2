from django.urls import path
from . import views

app_name = 'visuals'

urlpatterns = [
    # Main Page (with Lock Screen)
    path('', views.index, name='index'),
    
    # Unlock Action (HTMX)
    path('unlock/', views.unlock, name='unlock'),
    
    # Data API (for Charts)
    path('data/', views.get_chart_data, name='get_chart_data'),
]
