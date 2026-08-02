# backend/core/inventory/middleware.py
"""
Middleware para validação de API Key comercial.
Rotas de autenticação de usuário (JWT) são excluídas.
"""

import re
import time
import logging
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class ApiKeyMiddleware(MiddlewareMixin):
    """
    Valida API Key comercial APENAS em endpoints específicos.
    Rotas de autenticação de usuário (JWT) são excluídas.
    """
    
    # ✅ Rotas que NÃO exigem API Key comercial
    EXCLUDED_PATHS = [
        # Auth de usuário (JWT)
        r'^/api/auth/',
        
        # Consentimento LGPD (pode ser anônimo)
        r'^/api/consent/',
        
        # Público
        r'^/api/public/',
        r'^/api/vitrine/',
        r'^/api/health/',
        r'^/api/theme/',
        r'^/api/plans/',        # ✅ preços públicos (PlanConfig)

        # Profile (usa JWT, não API Key)
        r'^/api/profile/',

        # ⚠️ Catálogo/busca de produtos: usado pelo AddProduct (busca por nome
        # e código de barras enquanto a consultora digita). As views são
        # AllowAny de propósito — não exigem login nem API key. Sem esta
        # exclusão, o middleware bloqueava com 401 "API Key ausente" mesmo
        # a view não exigindo nenhuma autenticação, quebrando a busca ao
        # cadastrar produto.
        r'^/api/products/',

        # ⚠️ CRM da vitrine: `leads/upsert` e `carts/persist` são chamados
        # por VISITANTES sem login (o "CRM invisível"). As rotas que exigem
        # autenticação (listar, ver, anonimizar, excluir) continuam
        # protegidas pelo IsAuthenticated do DRF — este middleware é
        # especificamente sobre a API comercial (chaves pk_live_), não sobre
        # login geral do app, então excluir o prefixo inteiro é seguro.
        r'^/api/crm/',

        # ⚠️ Duas rotas públicas novas, mesma classe de bug de sempre —
        # esquecer de excluir uma rota nova quebra com 401 "API Key
        # ausente" pra quem nunca deveria precisar de chave nenhuma:
        # /api/system-config/ precisa funcionar ATÉ pra visitante sem
        # login (precisa saber se o sistema está em manutenção antes de
        # tentar entrar), e /api/health/ é uma checagem de infraestrutura,
        # não uma chamada de negócio.
        r'^/api/system-config/',
        r'^/api/health/',

        # Cadastro/login de desenvolvedor: por definição, ninguém tem token
        # nenhum nesse momento — /me/ e as próximas rotas do produto de API
        # NÃO entram aqui, porque já mandam Bearer JWT (passa no branch
        # "eyJ" acima, sem precisar de exclusão).
        r'^/api/developers/register/',
        r'^/api/developers/login/',

        # Painel admin e pagamentos: autenticam por JWT (IsAdminUser /
        # IsAuthenticated), não pela API Key comercial. Sem estas linhas o
        # middleware bloqueava o painel inteiro e o checkout do Asaas.
        r'^/api/admin/',
        r'^/api/payments/',

        # Feature gates (usa JWT)
        r'^/api/admin/feature-gates/',
    ]
    
    def process_request(self, request):
        """
        Intercepta requisição para validar API Key.
        Retorna None para continuar, ou JsonResponse para bloquear.
        """
        path = request.path_info
        
        # ✅ Log seguro (sem vazar dados sensíveis)
        logger.debug(f"🔍 ApiKeyMiddleware: {request.method} {path}")
        
        # ✅ Verificar se é rota excluída
        for excluded_pattern in self.EXCLUDED_PATHS:
            if re.match(excluded_pattern, path):
                logger.debug(f"✅ Rota excluída: {path} ~ {excluded_pattern}")
                return None  # Continua sem validar API Key
        
        # ✅ Validar API Key comercial apenas para endpoints protegidos
        auth_header = request.headers.get('Authorization', '')
        
        # Extrair token (pode ser JWT ou API Key)
        if not auth_header.startswith('Bearer '):
            return self._error_response('API Key ausente. Use: Authorization: Bearer pk_live_••••')
        
        token = auth_header[7:]  # Remove "Bearer "
        
        # ✅ Diferenciar JWT de API Key comercial pelo prefixo
        if token.startswith('eyJ'):  # JWT começa com "eyJ..."
            # ✅ É um token JWT de usuário - permitir passar
            # O JWT será validado depois por SimpleJWT authentication
            logger.debug("✅ Token JWT detectado, permitindo passagem para SimpleJWT")
            return None
        
        # ✅ É uma API Key comercial - validar formato
        if not token.startswith('pk_live_') and not token.startswith('pk_test_'):
            return self._error_response('Formato de API Key inválido. Use pk_live_••• ou pk_test_•••')
        
        # ✅ Validar no banco de dados
        try:
            from .models import ApiKey
            key_obj = ApiKey.objects.select_related('owner', 'store', 'developer').get(
                key=token,
                is_active=True
            )

            # Expiração — antes NUNCA era checada, uma chave "expirada" continuava
            # funcionando pra sempre.
            if key_obj.expires_at and key_obj.expires_at < timezone.now():
                return self._error_response('API Key expirada', status_code=401)

            # Limite por minuto — janela deslizante simples via cache (cada
            # minuto tem sua própria chave, expira sozinha em 60s). Antes o
            # campo `rate_limit` existia no modelo, mas nada o consultava.
            janela = int(time.time() // 60)
            cache_key = f"api_rate:{key_obj.id}:{janela}"
            contagem = cache.get(cache_key, 0)
            if contagem >= key_obj.rate_limit:
                return self._error_response(
                    f'Limite de {key_obj.rate_limit} requisições por minuto excedido', status_code=429
                )
            cache.set(cache_key, contagem + 1, timeout=60)

            # Cota mensal — check_quota() existia no modelo só como TODO
            # ("Implementar lógica real com ApiUsageLog"), nunca foi ligado
            # a nada.
            if not key_obj.check_quota():
                return self._error_response(
                    f'Cota mensal de {key_obj.monthly_quota} requisições excedida', status_code=429
                )

            # Anexado ao request pra: (1) as views usarem, e (2)
            # process_response registrar o uso — ver abaixo.
            request.api_key = key_obj
            request._api_key_start = time.monotonic()
            request.api_plan = key_obj.plan
            request.api_scopes = key_obj.scopes or []
            logger.debug(f"✅ API Key válida: {key_obj.name or key_obj.key[:10]}...")
        except ApiKey.DoesNotExist:
            logger.warning(f"⚠️ API Key inválida: {token[:10]}...")
            return self._error_response('API Key inválida ou inativa')
        except Exception as e:
            logger.error(f"❌ Erro ao validar API Key: {e}")
            return self._error_response('Erro interno ao validar API Key')
        
        return None

    def process_response(self, request, response):
        """
        Registra o uso real da API Key nesta requisição — antes, ApiUsageLog
        nunca era escrito por ninguém, era um modelo pronto sem consumidor.

        Só loga quando `request.api_key` existe (ou seja, quando esta
        requisição realmente autenticou com uma chave comercial — não
        registra requisição de JWT de consultora/desenvolvedor).
        """
        api_key = getattr(request, 'api_key', None)
        if api_key is not None:
            try:
                from .models import ApiKey, ApiUsageLog
                inicio = getattr(request, '_api_key_start', None)
                latencia_ms = int((time.monotonic() - inicio) * 1000) if inicio else 0

                ApiUsageLog.objects.create(
                    api_key=api_key,
                    endpoint=request.path[:100],
                    method=request.method,
                    status_code=response.status_code,
                    response_time_ms=latencia_ms,
                    ip_address=self._client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                )
                # Só um UPDATE direto — não carrega o objeto de novo, e não
                # atrasa a resposta que já foi montada.
                ApiKey.objects.filter(id=api_key.id).update(last_used=timezone.now())
            except Exception:
                # Log nunca pode derrubar a resposta real da API — se
                # falhar, só registra no log de erro do Django e segue.
                logger.exception("Falha ao registrar uso de API (ApiUsageLog)")
        return response

    def _client_ip(self, request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    def _error_response(self, message: str, status_code: int = 401):
        """
        Retorna resposta de erro compatível com middleware Django.
        Usa JsonResponse em vez de DRF Response para evitar conflitos.
        """
        logger.warning(f"⚠️ ApiKeyMiddleware error: {message}")
        return JsonResponse(
            {'error': message}, 
            status=status_code,
            json_dumps_params={'ensure_ascii': False}
        )