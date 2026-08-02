# apps/payments/views.py
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.conf import settings
from django.apps import apps

from .services.asaas_service import asaas_service, AsaasAPIError

logger = logging.getLogger(__name__)


def _get_store(request):
    """Helper para buscar store do usuário autenticado"""
    # Tenta relação direta primeiro
    store = getattr(request.user, 'store', None)
    if store:
        return store

    # Fallback: busca pelo owner
    try:
        # ⚠️ CORREÇÃO: era get_model('stores', ...) — app inexistente.
        Store = apps.get_model('inventory', 'Store')
        return Store.objects.get(owner=request.user)
    except Exception:
        return None


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asaas_create_checkout(request):
    """
    POST /api/payments/asaas/checkout/
    Body: { "billing_cycle": "monthly"|"yearly" }
    """
    store = _get_store(request)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    if store.plan == 'pro':
        return Response({'error': 'Loja já possui plano PRO'}, status=status.HTTP_400_BAD_REQUEST)

    billing_cycle = request.data.get('billing_cycle', 'monthly')

    try:
        result = asaas_service.create_payment_link(store=store, billing_cycle=billing_cycle)
        return Response({
            'checkout_url': result.get('url'),
            'payment_link_id': result.get('id'),
            'billing_cycle': billing_cycle,
            'status': 'pending',
        }, status=status.HTTP_201_CREATED)
    except AsaasAPIError as e:
        return Response({'error': e.message}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def asaas_subscription_status(request):
    """GET /api/payments/asaas/status/"""
    store = _get_store(request)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=status.HTTP_404_NOT_FOUND)

    from django.utils import timezone
    now = timezone.now()

    is_active = (
        store.plan == 'pro'
        and store.subscription_expires_at
        and store.subscription_expires_at > now
    )

    days_remaining = 0
    if store.subscription_expires_at and store.subscription_expires_at > now:
        days_remaining = (store.subscription_expires_at - now).days

    return Response({
        'plan': store.plan,
        'is_active': is_active,
        'payment_provider': store.payment_provider,
        'subscription_started_at': store.subscription_started_at,
        'subscription_expires_at': store.subscription_expires_at,
        'days_remaining': days_remaining,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def asaas_webhook(request):
    """
    POST /api/payments/asaas/webhook/
    Endpoint público para receber notificações do Asaas.
    """
    # Validar token
    webhook_token = getattr(settings, 'ASAAS_WEBHOOK_TOKEN', '')
    if webhook_token:
        received_token = request.headers.get('asaas-access-token', '')
        if received_token != webhook_token:
            logger.warning("[ASAAS WEBHOOK] Token inválido")
            return Response({'error': 'Unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

    event = request.data.get('event')
    if not event:
        return Response({'error': 'Event required'}, status=status.HTTP_400_BAD_REQUEST)

    supported = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'SUBSCRIPTION_CANCELED']
    if event not in supported:
        return Response({'status': 'ignored', 'event': event})

    result = asaas_service.process_webhook(event=event, payload=request.data)
    return Response(result)


# ─── ADMIN ENDPOINTS ─────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def asaas_admin_config(request):
    """GET /api/admin/payments/asaas/config/ - Retorna config atual do Asaas"""
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'environment': getattr(settings, 'ASAAS_ENVIRONMENT', 'sandbox'),
        'base_url': getattr(settings, 'ASAAS_BASE_URL', ''),
        'has_api_key': bool(getattr(settings, 'ASAAS_API_KEY', '')),
        'has_webhook_token': bool(getattr(settings, 'ASAAS_WEBHOOK_TOKEN', '')),
        'webhook_url': request.build_absolute_uri('/api/payments/asaas/webhook/'),
    })

# apps/payments/views.py

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def asaas_admin_test_connection(request):
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    # --- DEBUG INÍCIO ---
    import logging
    logger = logging.getLogger(__name__)
    
    api_key = getattr(settings, 'ASAAS_API_KEY', 'NAO_ENCONTRADA')
    env = getattr(settings, 'ASAAS_ENVIRONMENT', 'NAO_ENCONTRADO')
    
    logger.warning(f"🔍 DEBUG ASAAS:")
    logger.warning(f"   API Key encontrada? {api_key != 'NAO_ENCONTRADA'}")
    logger.warning(f"   API Key começa com $? {api_key.startswith('$') if isinstance(api_key, str) and api_key else 'N/A'}")
    logger.warning(f"   Ambiente: {env}")
    logger.warning(f"   Tamanho da chave: {len(api_key) if isinstance(api_key, str) else 0}")
    # --- DEBUG FIM ---

    try:
        result = asaas_service._request('GET', 'finance/balance')
        return Response({
            'status': 'connected',
            'balance': result.get('balance'),
            'environment': env,
        })
    except AsaasAPIError as e:
        logger.error(f"❌ ERRO ASAAS API: {e.message}")
        return Response({
            'status': 'error',
            'message': e.message,
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error(f"❌ ERRO GERAL: {str(e)}")
        return Response({
            'status': 'error',
            'message': f'Erro interno: {str(e)}',
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)