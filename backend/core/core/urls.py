"""
core/urls.py — roteamento raiz (ROOT_URLCONF).

Este arquivo faz UMA coisa: montar os apps. Nenhuma rota de negócio e
nenhuma view moram aqui.

⚠️ POR QUE ISSO IMPORTA (histórico real deste projeto):
Antes, 27 das 32 rotas daqui eram CÓPIAS das que já existiam em
inventory/urls.py. Como o Django resolve a primeira correspondência e essas
cópias vinham antes do include, elas venciam — e as versões em
inventory/urls.py nunca eram usadas. Na prática: quem editasse
inventory/urls.py achava que tinha mudado a rota, e nada acontecia.
Isso também tornava fácil "perder" rotas ao sobrescrever um dos arquivos.

Agora a regra é simples:
  • rota de estoque, venda, perfil, relatórios → inventory/urls.py
  • rota do painel admin                        → inventory/admin_urls.py
  • rota do assistente                          → ai/urls.py
  • rota de pagamento                           → apps/payments/urls.py
  • rota de desenvolvedor (produto de API)       → apps/developers/urls.py
  • rota da API comercial (/api/v1/...)         → inventory/api_comercial_urls.py

Se precisar de uma rota nova, ela vai no arquivo do app — nunca aqui.

⚠️ As 6 linhas de inclusão abaixo são críticas: sem elas o sistema responde 404
em tudo. Antes de qualquer push:
    grep -c "path('' , include" ... ou simplesmente confira que as 5
    linhas marcadas abaixo continuam presentes.
"""
from django.urls import path, include

urlpatterns = [
    # Nota: o admin nativo do Django (/admin/) NÃO é montado de propósito.
    # A administração do produto é feita pelo painel próprio, em
    # inventory/admin_urls.py. Expor o /admin/ do Django acrescentaria uma
    # tela de login pública sem necessidade.

    # ⚠️ AS 6 LINHAS CRÍTICAS ⚠️
    path('', include('inventory.urls')),                    # estoque, vendas, perfil, relatórios
    path('api/admin/', include('inventory.admin_urls')),    # painel administrativo
    path('api/chat/', include('ai.urls')),                  # assistente Amorinha
    path('api/payments/', include('apps.payments.urls')),   # Asaas
    path('api/developers/', include('apps.developers.urls')),  # login/cadastro de desenvolvedor (produto de API)
    path('api/v1/', include('inventory.api_comercial_urls')),  # catálogo/lookup/ping — a API comercial de verdade
]