# apps/payments/urls.py
from django.urls import path, include
from . import views

app_name = 'payments'

# URLs públicas (webhook)
public_urlpatterns = [
    path('asaas/webhook/', views.asaas_webhook, name='asaas-webhook'),
]

# URLs protegidas (requer autenticação)
protected_urlpatterns = [
    path('asaas/checkout/', views.asaas_create_checkout, name='asaas-checkout'),
    path('asaas/status/', views.asaas_subscription_status, name='asaas-status'),


# URLs admin (requer is_staff)

    path('asaas/config/', views.asaas_admin_config, name='asaas-admin-config'),
    path('asaas/test/', views.asaas_admin_test_connection, name='asaas-admin-test'),
]

urlpatterns = [
    # Rotas públicas
    path('', include((public_urlpatterns, 'public'), namespace='public')),
    
    # Rotas protegidas (auth required)
    path('', include((protected_urlpatterns, 'protected'), namespace='protected')),
    
    # Rotas admin (is_staff required) - note o prefixo 'admin/'
   # path('admin/', include((admin_urlpatterns, 'admin'), namespace='admin')),
]