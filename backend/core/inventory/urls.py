"""
backend/core/inventory/urls.py

Rotas do app inventory: estoque, vendas, perfil, consentimento, relatórios.
Montadas na raiz por core/urls.py através de path('', include('inventory.urls')).

⚠️ É AQUI que entra rota nova de negócio — nunca em core/urls.py, que agora
faz apenas o roteamento dos apps. Antes os dois arquivos tinham 28 rotas
duplicadas e as versões daqui eram ignoradas pelo Django.
"""
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

# Views de autenticação e perfil
from inventory.views import (
    CustomTokenObtainPairView,
    CustomUserCreateView,
    FirebaseLoginView,
  
    profile_view,
    mei_summary,
    consultant_reports,
    movements_report_csv,
    stock_report_csv,
    public_plans_view,
    active_promotions_view,
    mei_report_csv,
)

# Views de consentimento LGPD
from inventory.views import (
    record_consent,
    revoke_consent,
    get_my_consents,
    export_my_data,
)

# Views de tema (público e admin)
from inventory.views import ThemeConfigPublicView, ThemeConfigAdminView

# Views de dashboard e analytics
from inventory.views import (
    dashboard_overview,
    dashboard_stats,
    dashboard_financial_summary,
    dashboard_inventory_analysis,
    cash_flow_summary,
    cash_flow_detailed,
)

# Views de feature gates e planos
from inventory.views import feature_gates_view, check_plan_limits_complete

# Views de sessão
from inventory.views import SessionControlView, SessionSummaryView

# Views públicas
from inventory.views import public_storefront, public_storefront_view, lookup_product
from inventory.views import (
    crm_leads_list, crm_lead_detail, crm_lead_upsert,
    crm_lead_anonymize, crm_cart_persist, crm_notifications, crm_cart_update,
    register_promotion_view, system_config_view, health_check_view,
)

# Swagger/Documentação
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    
    # ==========================================
    # 🔐 AUTHENTICATION (Rotas principais)
    # ==========================================
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/register/', CustomUserCreateView.as_view(), name='register'),
    path('api/auth/firebase/', FirebaseLoginView.as_view(), name='firebase_login'),
    
    # ==========================================
    # 👤 PROFILE & CONFIGURAÇÕES
    # ==========================================
    path('api/profile/', profile_view, name='profile'),
    path('api/admin/feature-gates/', feature_gates_view, name='feature_gates'),
    path('api/check-plan-limits/', check_plan_limits_complete, name='check_plan_limits'),
    
    # ==========================================
    # 📊 DASHBOARD & ANALYTICS
    # ==========================================
    path('api/dashboard/overview/', dashboard_overview, name='dashboard_overview'),
    path('api/stats/dashboard/', dashboard_stats, name='dashboard_stats'),
    path('api/dashboard/financial/', dashboard_financial_summary, name='dashboard_financial'),
    path('api/dashboard/inventory/', dashboard_inventory_analysis, name='dashboard_inventory'),
    path('api/cash-flow/summary/', cash_flow_summary, name='cash_flow_summary'),
    path('api/plans/', public_plans_view, name='public_plans'),

    # ⚠️ A superfície /api/v1/ (produto de dados pra desenvolvedores) mudou
    # de lugar — agora é toda registrada em inventory/api_comercial_urls.py,
    # incluída direto em core/urls.py. Antes só o /ping/ estava aqui,
    # separado dos outros endpoints da mesma API — duas fontes de verdade
    # pra uma coisa só.
    path('api/promotions/active/', active_promotions_view, name='active_promotions'),
    path('api/promotions/<uuid:promotion_id>/view/', register_promotion_view, name='register_promotion_view'),
    path('api/system-config/', system_config_view, name='system_config'),
    path('api/health/', health_check_view, name='health_check'),

    # 📊 Relatórios da consultora (dashboard com filtro de período)
    path('api/reports/', consultant_reports, name='consultant_reports'),
    path('api/movements/report/', movements_report_csv, name='movements_report'),
    path('api/stock/report/', stock_report_csv, name='stock_report'),
    # 💰 Fluxo de caixa simplificado (MEI)
    path('api/mei/summary/', mei_summary, name='mei_summary'),
    path('api/mei/report/', mei_report_csv, name='mei_report'),
    path('api/cash-flow/detailed/', cash_flow_detailed, name='cash_flow_detailed'),
    
    # ==========================================
    # 🔐 LGPD - CONSENTIMENTO (Rotas principais)
    # ==========================================
    path('api/consent/', record_consent, name='record_consent'),
    path('api/consent/revoke/<str:purpose>/', revoke_consent, name='revoke_consent'),
    path('api/consent/my/', get_my_consents, name='get_my_consents'),
    path('api/consent/export/', export_my_data, name='export_my_data'),
    
    # ==========================================
    # 🎨 TEMA (Público e Admin)
    # ==========================================
    path('api/public/theme/', ThemeConfigPublicView.as_view(), name='theme_public'),
    path('api/admin/theme/', ThemeConfigAdminView.as_view(), name='theme_admin'),
    
    # ==========================================
    # 📦 SESSÃO DE CADASTRO
    # ==========================================
    path('api/session-control/', SessionControlView.as_view(), name='session_control'),
    path('api/session-summary/', SessionSummaryView.as_view(), name='session_summary'),
    
    # ==========================================
    # 🌐 ROTAS PÚBLICAS
    # ==========================================
    path('api/products/lookup/', lookup_product, name='lookup_product'),
    # ⚠️ CORREÇÃO: apontava para `public_storefront`, a view antiga que não
    # envia marca do produto nem o user_id da loja (usado para amarrar o
    # lead do CRM). `public_storefront_view` já existia no código, mais
    # completa, mas nunca tinha sido roteada.
    path('api/public/storefront/<slug:slug>/', public_storefront_view, name='public_storefront_slug'),
    path('api/public/storefront/', public_storefront_view, name='public_storefront_list'),

    # 📇 CRM da vitrine — leads e carrinhos capturados sem login do cliente
    path('api/crm/leads', crm_leads_list, name='crm_leads_list'),
    path('api/crm/leads/upsert', crm_lead_upsert, name='crm_lead_upsert'),
    path('api/crm/leads/<int:lead_id>', crm_lead_detail, name='crm_lead_detail'),
    path('api/crm/leads/<int:lead_id>/anonymize', crm_lead_anonymize, name='crm_lead_anonymize'),
    path('api/crm/carts/persist', crm_cart_persist, name='crm_cart_persist'),
    path('api/crm/notifications', crm_notifications, name='crm_notifications'),
    path('api/crm/carts/<int:cart_id>', crm_cart_update, name='crm_cart_update'),
    
    # ==========================================
    # 📚 DOCUMENTAÇÃO API (Swagger)
    # ==========================================
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

# ==========================================
# 📦 ESTOQUE & MOVIMENTAÇÕES (Router DRF)
# ==========================================
# CORREÇÃO (Auditoria P0.1): InventoryViewSet, StockTransactionViewSet e
# StockEntryView sempre existiram em views.py, mas nenhum router os
# registrava — o frontend chamava /api/inventory/ e /api/transactions/ e
# recebia 404. Este bloco fecha essa lacuna.
from rest_framework.routers import DefaultRouter
from inventory.views import InventoryViewSet, StockTransactionViewSet, StockEntryView, ProductViewSet

router = DefaultRouter()
router.register(r'api/inventory', InventoryViewSet, basename='inventory')
router.register(r'api/transactions', StockTransactionViewSet, basename='transactions')
# ⚠️ CORREÇÃO: em v1.0.0 existia `router.register(r'products', ProductViewSet)`.
# Na consolidação das URLs deste projeto, o router foi reconstruído do zero e
# essa linha ficou de fora — GET/POST /api/products/ e /api/products/<id>/
# passaram a devolver 404. É o catálogo global (AllowAny, sem filtro por
# loja), usado pelo AddProduct para listar/consultar produtos por ID.
router.register(r'api/products', ProductViewSet, basename='products')

urlpatterns += router.urls
urlpatterns += [
    path('api/stock/entry/', StockEntryView.as_view(), name='stock_entry'),
]