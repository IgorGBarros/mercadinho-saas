# backend/core/inventory/api_comercial_urls.py
"""
URLs para API Comercial v1 (acesso via API Key)
Estes endpoints são destinados a integrações externas e parceiros comerciais.
"""
from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

# Tenta importar as views da API comercial (fallback seguro)
try:
    from .api_comercial_views import (
        api_products_list,
        api_product_lookup,
        api_public_storefront,
        api_ping_view,
    )
    HAS_COMMERCIAL_VIEWS = True
except ImportError:
    HAS_COMMERCIAL_VIEWS = False
    # Aviso apenas em DEBUG para não poluir logs de produção
    import sys
    if 'runserver' in sys.argv or 'pytest' in sys.argv:
        print("⚠️ api_comercial_views.py não encontrado. Endpoints da API comercial desativados.")

# ⚠️ api_analytics_products EXISTE em api_comercial_views.py, mas não está
# roteado de propósito: calcula composição do CATÁLOGO (quantos produtos
# por marca existem cadastrados), não comportamento de VENDA (quais
# produtos mais venderam, por marca, por época — que é StockTransaction,
# nunca consultado ali). É o produto de dados que o Minha Amora pretende
# vender de verdade — merece ser refeito do zero consultando a fonte certa,
# não herdar um cálculo que mede outra coisa só porque tem o nome certo.

# URLs base: documentação Swagger (sempre disponível)
#
# ⚠️ urlconf=__name__ é o que restringe a introspecção do schema só às
# rotas DESTE arquivo. Sem isso, SpectacularAPIView tenta documentar TODAS
# as views do projeto inteiro — inclusive as internas do admin-panel e da
# consultora, que não são pra ficar públicas — e travava tentando
# serializar um objeto de uma dessas views que não é um Serializer padrão
# do DRF.
urlpatterns = [
    # Documentação OpenAPI/Swagger
    path('schema/', SpectacularAPIView.as_view(urlconf=__name__), name='schema'),
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

# Endpoints da API comercial (apenas se as views existirem)
if HAS_COMMERCIAL_VIEWS:
    urlpatterns += [
        # Testa se uma chave funciona — mesma ideia do /v1/account da Stripe
        path('ping/', api_ping_view, name='api-ping'),

        # Catálogo de produtos (leitura)
        path('products/', api_products_list, name='api-products-list'),
        
        # Lookup inteligente por código de barras ou nome
        path('products/lookup/', api_product_lookup, name='api-product-lookup'),
        
        # Vitrine pública de consultoras (acesso por slug)
        path('public/storefront/<str:slug>/', api_public_storefront, name='api-public-storefront'),

        # analytics/products/ fica de fora até ser refeito com dado de venda real
    ]

# ✅ Metadata para admin Django (opcional)
app_name = 'api_comercial'