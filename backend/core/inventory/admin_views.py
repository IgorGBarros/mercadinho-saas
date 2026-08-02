# inventory/admin_views.py
import logging
from decimal import Decimal
from datetime import timedelta
from django.db.models import Count, Sum, Avg, Max, Q, F
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import (
    Product, Store, InventoryItem, Sale, UserBehaviorLog, 
    PlanConfig, Promotion, CustomUser, ConsentRecord, StockTransaction,
    Lead, Cart, CartItem, SystemConfig, ApiKey, ApiUsageLog,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# UTILITÁRIOS
# ─────────────────────────────────────────────────────────────

def safe_div(a, b, default=0.0):
    """Divisão segura para cálculos de porcentagem"""
    return round(a / b * 100, 2) if b and b > 0 else default


# ─────────────────────────────────────────────────────────────
# PLANOS & PROMOÇÕES (CRUD Admin)
# ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminUser])
def list_plan_configs(request):
    """GET /api/admin/plan-configs/ → Lista configurações de planos"""
    configs = PlanConfig.objects.all().order_by('sort_order')
    return Response([_serialize_plan_config(c) for c in configs])


def _serialize_plan_config(c):
    """Forma única de serializar um PlanConfig (usada no list e no update)."""
    return {
        'plan_type': c.plan_type,
        'display_name': c.display_name,
        'description': c.description,
        'max_products': c.max_products,
        'can_use_scanner': c.can_use_scanner,
        'can_use_storefront': c.can_use_storefront,
        'can_use_alerts': c.can_use_alerts,
        'can_use_ai_assistant': c.can_use_ai_assistant,
        'can_use_analytics': c.can_use_analytics,
        'monthly_price': float(c.monthly_price),
        'yearly_price': float(c.yearly_price),
        'highlight_color': c.highlight_color,
        'is_popular': c.is_popular,
        'is_visible': c.is_visible,
        'sort_order': c.sort_order,
    }


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def update_plan_config(request, plan_type):
    """
    PATCH /api/admin/plan-configs/<plan_type>/ → Edita um plano.

    Este é o elo que conecta o painel admin ao resto do sistema: ao mudar
    aqui monthly_price/yearly_price, o preço passa a valer no checkout do
    Asaas (asaas_service._get_pro_price), no Plans.tsx e no /profile/
    (current_limits) — tudo lendo do mesmo PlanConfig. Limites e flags de
    recurso editados aqui também refletem imediatamente nos feature gates.
    """
    config = PlanConfig.objects.filter(plan_type=plan_type).first()
    if not config:
        return Response({'error': f"Plano '{plan_type}' não encontrado."}, status=404)

    # Só campos permitidos; ignora o resto do payload por segurança.
    editable_decimal = {'monthly_price', 'yearly_price'}
    editable_int = {'max_products', 'sort_order', 'yearly_discount_percent', 'max_storage_mb'}
    editable_bool = {
        'can_use_scanner', 'can_use_storefront', 'can_use_alerts',
        'can_use_ai_assistant', 'can_use_analytics', 'can_export_data',
        'can_use_api', 'is_popular', 'is_visible',
    }
    editable_str = {'display_name', 'description', 'highlight_color'}

    data = request.data or {}
    errors = {}
    for field, value in data.items():
        try:
            if field in editable_decimal:
                dec = Decimal(str(value))
                if dec < 0:
                    errors[field] = 'não pode ser negativo'
                    continue
                setattr(config, field, dec)
            elif field in editable_int:
                setattr(config, field, None if value is None else int(value))
            elif field in editable_bool:
                setattr(config, field, bool(value))
            elif field in editable_str:
                setattr(config, field, str(value))
            # campos fora da allowlist são silenciosamente ignorados
        except (ValueError, TypeError, ArithmeticError):
            errors[field] = 'valor inválido'

    if errors:
        return Response({'error': 'Campos inválidos', 'details': errors}, status=400)

    config.save()
    return Response(_serialize_plan_config(config))


def _serialize_promotion(p):
    # 📊 Métricas REAIS — antes eram Math.random() no frontend, recalculadas
    # (e diferentes!) a cada renderização da tela.
    #
    # "Visualizações" = quantas lojas DIFERENTES viram esta promoção
    # (PromotionView, uma linha por loja — repetição não infla).
    #
    # "Conversões" = dessas lojas que viram, quantas são PRO hoje E viraram
    # PRO DEPOIS de terem visto a promoção — sem o "depois", uma loja que já
    # era PRO antes da promoção existir contaria como se a promoção tivesse
    # convertido ela, o que não é verdade.
    visualizacoes = p.views.select_related('store').all()
    total_visualizacoes = visualizacoes.count()
    conversoes = 0
    for v in visualizacoes:
        loja = v.store
        if loja.plan == 'pro' and loja.subscription_started_at and loja.subscription_started_at >= v.viewed_at:
            conversoes += 1
    taxa_conversao = round((conversoes / total_visualizacoes * 100), 1) if total_visualizacoes else 0.0

    return {
        'id': str(p.id),
        'title': p.title,
        'message': p.message,
        'promotion_type': p.promotion_type,
        'target_audience': p.target_audience,
        'target_store_ids': list(p.target_stores.values_list('id', flat=True)),
        'discount_percent': p.discount_percent,
        'discount_amount': float(p.discount_amount),
        'is_active': p.is_active,
        'starts_at': p.starts_at.isoformat(),
        'ends_at': p.ends_at.isoformat() if p.ends_at else None,
        'max_views_per_store': p.max_views,
        'background_color': p.background_color,
        'text_color': p.text_color,
        'created_at': p.created_at.isoformat(),
        'views_count': total_visualizacoes,
        'conversions_count': conversoes,
        'conversion_rate': taxa_conversao,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def list_promotions(request):
    """GET /api/admin/promotions/ → Lista promoções"""
    promotions = Promotion.objects.all().order_by('-created_at')
    return Response([_serialize_promotion(p) for p in promotions])


# ⚠️ CORREÇÃO GRAVE: até aqui só existia LISTAR. O botão "Salvar" do
# admin-panel nunca chamava nenhuma API — só mexia em estado local do
# React, com um id falso (Date.now()). Uma promoção "criada" sumia ao
# atualizar a página; ativar/desativar tinha o mesmo problema. O recurso
# inteiro era cosmético.

_CAMPOS_PROMOCAO = [
    'title', 'message', 'promotion_type', 'target_audience',
    'discount_percent', 'discount_amount', 'is_active',
    'starts_at', 'ends_at', 'max_views', 'background_color', 'text_color',
]


@api_view(['POST'])
@permission_classes([IsAdminUser])
def create_promotion(request):
    """POST /api/admin/promotions/create/"""
    data = request.data
    if not data.get('title') or not data.get('message'):
        return Response({'error': 'title e message são obrigatórios'}, status=400)

    promo = Promotion()
    for campo in _CAMPOS_PROMOCAO:
        if campo in data and data[campo] is not None:
            setattr(promo, campo, data[campo])
    try:
        promo.save()
    except Exception as e:
        return Response({'error': f'Não foi possível salvar: {e}'}, status=400)

    # target_store_ids: lista de IDs de Store (não de usuário — ver
    # list_users, que já tem essa mesma ressalva marcada).
    ids_lojas = data.get('target_store_ids')
    if isinstance(ids_lojas, list):
        promo.target_stores.set(Store.objects.filter(id__in=ids_lojas))

    return Response(_serialize_promotion(promo), status=201)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAdminUser])
def promotion_detail(request, promotion_id):
    """
    PATCH  /api/admin/promotions/<id>/ — edita (inclui ativar/desativar).
    DELETE /api/admin/promotions/<id>/ — exclui definitivamente.
    """
    promo = Promotion.objects.filter(id=promotion_id).first()
    if not promo:
        return Response({'error': 'Promoção não encontrada'}, status=404)

    if request.method == 'DELETE':
        promo.delete()
        return Response(status=204)

    data = request.data
    for campo in _CAMPOS_PROMOCAO:
        if campo in data and data[campo] is not None:
            setattr(promo, campo, data[campo])
    try:
        promo.save()
    except Exception as e:
        return Response({'error': f'Não foi possível salvar: {e}'}, status=400)

    if 'target_store_ids' in data and isinstance(data['target_store_ids'], list):
        promo.target_stores.set(Store.objects.filter(id__in=data['target_store_ids']))

    return Response(_serialize_promotion(promo))


# ─────────────────────────────────────────────────────────────
# USUÁRIOS & LOJAS (Listagem com Métricas Reais)
# ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminUser])
def list_users(request):
    """
    GET /api/admin/users/ → Lista lojas/consultoras com métricas
    Interface compatível com AdminUser[] do frontend
    """
    now = timezone.now()
    stores = Store.objects.select_related('owner').prefetch_related('items', 'sales')
    
    data = []
    for store in stores:
        owner = store.owner
        if not owner:
            continue
        
        # Última atividade: log comportamental ou updated_at
        last_log = UserBehaviorLog.objects.filter(store=store).aggregate(last=Max('created_at'))
        last_activity = last_log['last'] or store.updated_at
        
        # Receita total da loja (apenas vendas)
        total_revenue = store.sales.filter(
            transaction_type='VENDA'
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        
        # Status da assinatura (lógica real)
        if store.plan == 'free':
            sub_status = 'free'
            days_left = None
        elif not store.subscription_expires_at:
            sub_status = 'active'
            days_left = None
        elif now > store.subscription_expires_at:
            sub_status = 'expired'
            days_left = 0
        else:
            sub_status = 'active'
            days_left = max(0, (store.subscription_expires_at - now).days)
            
        data.append({
            'id': owner.id,  # ID do owner para compatibilidade com update_plan
            'store_id': store.id,  # ⚠️ ID da LOJA — necessário pra Promotion.target_stores,
                                    # que é M2M com Store, não com o usuário.
            'email': owner.email,
            'display_name': owner.name,
            'plan': store.plan,
            'store_slug': store.slug,
            'storefront_enabled': bool(store.slug),
            'whatsapp_number': store.whatsapp,
            'product_count': store.items.count(),
            'created_at': store.created_at.isoformat(),
            'last_sign_in': last_activity.isoformat(),
            'subscription_started_at': store.subscription_started_at.isoformat() if store.subscription_started_at else None,
            'subscription_expires_at': store.subscription_expires_at.isoformat() if store.subscription_expires_at else None,
            'payment_provider': store.payment_provider,
            'payment_external_id': store.payment_external_id,
            'subscription_status': sub_status,
            'days_until_expiry': days_left,
            'can_add_products': store.can_add_products,  # property do model
            'total_value': float(total_revenue),
            'last_activity': last_activity.isoformat()
        })
    return Response(data)


# ─────────────────────────────────────────────────────────────
# ESTATÍSTICAS DO SISTEMA (Dashboard)
# ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_system_stats(request):
    """
    GET /api/admin/stats/ → Métricas agregadas do sistema
    Interface compatível com SystemStats do frontend
    """
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    total_stores = Store.objects.count()
    pro_stores = Store.objects.filter(plan='pro').count()
    free_stores = total_stores - pro_stores
    
    # Lojas ativas: com log comportamental nos últimos 30 dias
    active_stores = Store.objects.filter(
        behavior_logs__created_at__gte=now - timedelta(days=30)
    ).distinct().count()
    
    # Produtos no catálogo global
    total_products = Product.objects.count()
    # ⚠️ CORREÇÃO (FieldError → 500): Avg('items__count') não é um lookup
    # válido — não existe o campo 'count'. Para a média de itens por loja é
    # preciso anotar a contagem por loja primeiro e então tirar a média.
    avg_products = Store.objects.annotate(
        _n_items=Count('items')
    ).aggregate(avg=Avg('_n_items'))['avg'] or 0
    
    # Receita: total e mensal (apenas vendas)
    # ⚠️ CORREÇÃO (tudo zerado no painel): o admin lia de Sale.total_amount,
    # mas a maioria dos fluxos de venda do sistema grava só em
    # StockTransaction (VENDA) — Sale quase nunca é populada. Todo o resto
    # (dashboards, cash-flow, cost analysis) já calcula receita a partir de
    # StockTransaction. Alinhamos o admin à mesma fonte canônica: receita =
    # soma de (unit_price * quantidade vendida). Como quantity de VENDA é
    # negativa (baixa de estoque), usamos o valor absoluto via -quantity.
    revenue_expr = Sum(F('unit_price') * (F('quantity') * -1))
    total_revenue = StockTransaction.objects.filter(
        transaction_type='VENDA'
    ).aggregate(s=revenue_expr)['s'] or Decimal('0')

    monthly_revenue = StockTransaction.objects.filter(
        transaction_type='VENDA', created_at__gte=month_start
    ).aggregate(s=revenue_expr)['s'] or Decimal('0')

    # 💰 Receita REAL da plataforma — assinaturas efetivamente pagas via
    # Asaas, vinda direto dos webhooks (ProcessedPaymentEvent.value). É
    # diferente de `total_revenue`/`monthly_revenue` acima, que são as
    # VENDAS DE PRODUTO das consultoras nas lojas delas — GMV da plataforma,
    # não receita do próprio Minha Amora. As duas métricas são legítimas,
    # mas não podem ser confundidas: o negócio (assinatura PRO) só aparece
    # nesta aqui.
    #
    # ⚠️ Fase 4: ProcessedPaymentEvent passou a registrar TAMBÉM assinatura
    # de API de desenvolvedor (mesma tabela de idempotência, ver modelo).
    # store__isnull=False garante que este widget continue mostrando só a
    # receita de assinatura das CONSULTORAS — a de API tem o próprio widget
    # em monitor_api_usage.
    from inventory.models import ProcessedPaymentEvent
    eventos_consultora = ProcessedPaymentEvent.objects.filter(store__isnull=False)
    platform_revenue_total = eventos_consultora.aggregate(
        s=Sum('value')
    )['s'] or Decimal('0')
    platform_revenue_month = eventos_consultora.filter(
        processed_at__gte=month_start
    ).aggregate(s=Sum('value'))['s'] or Decimal('0')

    # Últimos 30 dias, por dia — pra um gráfico de tendência, como qualquer
    # painel de assinatura (Stripe, Chargebee) mostra receita ao longo do
    # tempo, não só um número estático.
    from django.db.models.functions import TruncDate
    receita_por_dia = (
        eventos_consultora.filter(processed_at__gte=now - timedelta(days=30))
        .annotate(dia=TruncDate('processed_at'))
        .values('dia')
        .annotate(total=Sum('value'))
        .order_by('dia')
    )

    # Conversão: lojas que viraram PRO nos últimos 30 dias
    recent_upgrades = Store.objects.filter(
        plan='pro', 
        subscription_started_at__gte=now - timedelta(days=30),
        subscription_started_at__isnull=False
    ).count()
    
    # Churn estimado: PRO sem atividade > 30 dias
    inactive_pro_ids = Store.objects.filter(plan='pro').exclude(
        id__in=UserBehaviorLog.objects.filter(
            created_at__gte=now - timedelta(days=30)
        ).values('store_id')
    ).values_list('id', flat=True)
    
    return Response({
        'total_stores': total_stores,
        'active_stores': active_stores,
        'pro_stores': pro_stores,
        'free_stores': free_stores,
        'total_products': total_products,
        'total_revenue': float(total_revenue),
        'monthly_revenue': float(monthly_revenue),
        'platform_revenue_total': float(platform_revenue_total),
        'platform_revenue_month': float(platform_revenue_month),
        'platform_revenue_by_day': [
            {'date': r['dia'].isoformat(), 'value': float(r['total'] or 0)}
            for r in receita_por_dia
        ],
        'churn_rate': safe_div(len(inactive_pro_ids), pro_stores),
        'conversion_rate': safe_div(recent_upgrades, total_stores),
        'avg_products_per_store': round(avg_products, 1)
    })


# ─────────────────────────────────────────────────────────────
# ANALYTICS DE PRODUTOS (Catálogo Global)
# ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_product_analytics(request):
    """
    GET /api/admin/analytics/products/ → Analytics do catálogo
    Interface compatível com ProductAnalytics do frontend
    """
    total = Product.objects.count()
    with_barcode = Product.objects.exclude(bar_code__isnull=True).exclude(bar_code='').count()
    with_image = Product.objects.exclude(image_url__isnull=True).exclude(image_url='').count()
    completion = round(((with_barcode + with_image) / (total * 2) * 100), 1) if total else 0

    # Top marcas por quantidade
    brands = list(
        Product.objects.values('brand').annotate(
            count=Count('id'), avg=Avg('official_price')
        ).order_by('-count')
        .exclude(brand__isnull=True).exclude(brand='')[:10]
    )
    
    # Top categorias
    categories = list(
        Product.objects.values('category').annotate(count=Count('id'))
        .order_by('-count')[:10]
    )
    
    # Produtos mais populares (mais lojas cadastrando)
    popular = list(
        InventoryItem.objects.values(
            'product__name', 'product__brand', 'product__official_price'
        ).annotate(usage=Count('store', distinct=True))
        .order_by('-usage')[:10]
    )

    # Faixas de preço (processamento leve em memória)
    prices = Product.objects.values_list('official_price', flat=True)
    ranges = {'0-10': 0, '10-50': 0, '50-100': 0, '100+': 0}
    for p in prices:
        if p is None:
            continue
        if p <= 10:
            ranges['0-10'] += 1
        elif p <= 50:
            ranges['10-50'] += 1
        elif p <= 100:
            ranges['50-100'] += 1
        else:
            ranges['100+'] += 1

    return Response({
        'overview': {
            'total_products': total,
            'products_with_barcode': with_barcode,
            'products_with_image': with_image,
            'completion_rate': completion
        },
        'brands': [
            {'name': b['brand'], 'count': b['count'], 'avg_price': float(b['avg'] or 0)} 
            for b in brands
        ],
        'categories': [
            {'name': c['category'], 'count': c['count']} 
            for c in categories
        ],
        'popular_products': [
            {
                'name': p['product__name'], 
                'brand': p['product__brand'] or 'Outros', 
                'usage_count': p['usage'], 
                'official_price': float(p['product__official_price'] or 0)
            } 
            for p in popular
        ],
        'price_ranges': ranges
    })


# ─────────────────────────────────────────────────────────────
# ANALYTICS COMPORTAMENTAL (Base para ML — filtrado por consentimento LGPD)
# ─────────────────────────────────────────────────────────────

from .consent_utils import consented_user_ids as _consented_owner_ids


@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_store_behavior_analytics(request):
    """
    GET /api/admin/analytics/behavior/ → Padrões de uso agregados

    CORREÇÃO (P1): esta função contava TODAS as lojas e TODOS os
    UserBehaviorLog, sem checar consentimento algum, e retornava
    'lgpd_compliant': True fixo no código — uma afirmação de
    conformidade que o backend não garantia. Agora:
    - Toda métrica é calculada só sobre lojas cujo dono deu
      consentimento ativo para 'behavior_tracking'.
    - 'lgpd_compliant' deixa de ser um valor fixo: é verdadeiro por
      construção, porque os dados não-consentidos nunca entram na
      consulta.
    - Números que antes eram constantes fixas no código
      (avg_products, conversion_rate, data_quality_score etc.) foram
      trocados por cálculos reais onde há dado no banco para
      sustentar o cálculo. Onde não há (ex: taxa de conversão
      free→pro, que exigiria um histórico de mudança de plano que o
      sistema não guarda hoje), o campo foi removido em vez de manter
      um número inventado — ver nota em 'not_yet_available'.
    """
    now = timezone.now()

    consented_ids = _consented_owner_ids('behavior_tracking')
    total_stores_platform = Store.objects.count()

    stores_qs = Store.objects.filter(owner_id__in=consented_ids)
    logs_qs = UserBehaviorLog.objects.filter(store__owner_id__in=consented_ids)

    total_stores = stores_qs.count()
    logs_count = logs_qs.count()

    # Preferências por marca (agregado, sem PII) — só lojas consentidas
    prefs = list(
        InventoryItem.objects.filter(store__owner_id__in=consented_ids)
        .values('product__brand').annotate(
            stores=Count('store', distinct=True),
            qty=Sum('total_quantity')
        ).order_by('-stores')
        .exclude(product__brand__isnull=True)
        .exclude(product__brand='')[:5]
    )

    max_st = prefs[0]['stores'] if prefs else 1
    preferences = [
        {
            'brand': p['product__brand'],
            'stores_using': p['stores'],
            'total_quantity': p['qty'] or 0,
            'popularity_score': round(p['stores'] / max_st * 100, 1)
        }
        for p in prefs
    ]

    # Onboarding real por data de criação da loja — só lojas consentidas
    bucket_0_7 = stores_qs.filter(created_at__gte=now - timedelta(days=7))
    bucket_8_30 = stores_qs.filter(
        created_at__range=[now - timedelta(days=30), now - timedelta(days=7)]
    )
    bucket_31_90 = stores_qs.filter(
        created_at__range=[now - timedelta(days=90), now - timedelta(days=31)]
    )
    bucket_90p = stores_qs.filter(created_at__lte=now - timedelta(days=90))

    def _avg_products_per_store(bucket_qs):
        """Média real de itens de estoque por loja no bucket, calculada
        a partir do InventoryItem (substitui o valor fixo que existia antes)."""
        agg = (
            InventoryItem.objects.filter(store__in=bucket_qs)
            .values('store')
            .annotate(n=Count('id'))
            .aggregate(avg=Avg('n'))
        )
        return round(agg['avg'] or 0, 1)

    onboarding_patterns = {
        '0-7_days': {'stores_count': bucket_0_7.count(), 'avg_products': _avg_products_per_store(bucket_0_7)},
        '8-30_days': {'stores_count': bucket_8_30.count(), 'avg_products': _avg_products_per_store(bucket_8_30)},
        '31-90_days': {'stores_count': bucket_31_90.count(), 'avg_products': _avg_products_per_store(bucket_31_90)},
        '90+_days': {'stores_count': bucket_90p.count(), 'avg_products': _avg_products_per_store(bucket_90p)},
    }

    # Uso médio por plano — real, a partir do InventoryItem, só lojas consentidas
    usage_patterns = {}
    for plan_key in ('free', 'pro'):
        plan_stores = stores_qs.filter(plan=plan_key)
        usage_patterns[f'{plan_key}_plan'] = {
            'stores_count': plan_stores.count(),
            'avg_products': _avg_products_per_store(plan_stores),
        }

    # Indicador de churn: define o limiar (30 dias) e calcula quantas lojas
    # consentidas realmente se encaixam nele, a partir do último log de uso.
    churn_threshold_days = 30
    last_activity = (
        logs_qs.values('store').annotate(last_seen=Max('created_at'))
    )
    churned_count = sum(
        1 for row in last_activity
        if row['last_seen'] and row['last_seen'] < now - timedelta(days=churn_threshold_days)
    )

    consent_coverage_pct = safe_div(total_stores, total_stores_platform) if total_stores_platform else 0.0

    return Response({
        'behavior_patterns': {
            'onboarding_patterns': onboarding_patterns,
            'usage_patterns': usage_patterns,
            'product_preferences': preferences,
        },
        'ml_insights': {
            'churn_indicators': {
                'days_without_activity_threshold': churn_threshold_days,
                'stores_matching': churned_count,
            },
            'personalization_data': {
                'total_interactions': logs_count,
                'avg_logs_per_consented_store': round(logs_count / total_stores, 1) if total_stores else 0.0,
                'ready_for_ml': total_stores > 20,
            },
            'not_yet_available': [
                'conversion_rate (requer histórico de mudança de plano, hoje só existe o estado atual)',
                'avg_products_before_upgrade (mesma limitação acima)',
            ],
        },
        'data_summary': {
            'total_stores_analyzed': total_stores,
            'total_stores_platform': total_stores_platform,
            'consent_coverage_pct': consent_coverage_pct,
            'data_points_collected': logs_count,
            'analysis_date': now.isoformat(),
            'lgpd_compliant': True,
        }
    })


# ─────────────────────────────────────────────────────────────
# DATASET DE TREINO DE IA (finalidade 'ai_training' — LGPD)
# ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_ai_training_summary(request):
    """
    GET /api/admin/ai-training/summary/ → Tamanho/cobertura do dataset
    disponível para treino de IA, sempre filtrado por consentimento
    ativo na finalidade 'ai_training' (distinta de 'ai_features').
    Ver inventory/ai_training_export.py para as regras completas.
    """
    from .ai_training_export import training_dataset_summary
    return Response(training_dataset_summary())


# ─────────────────────────────────────────────────────────────
# MONITORAMENTO INTERNO: API & WEBHOOKS (Futura Comercialização)
# ─────────────────────────────────────────────────────────────
# inventory/admin_views.py - SUBSTITUA a função monitor_api_usage por esta versão:

@api_view(['GET'])
@permission_classes([IsAdminUser])
def monitor_api_usage(request):
    """
    GET /api/admin/api-monitor/ — dado real do produto de API.

    ⚠️ REESCRITO DO ZERO: a versão anterior usava lojas com vitrine ativa
    como "proxy" de chave de API (gerando um prefixo falso a partir do
    slug — nenhuma chave real tinha sido emitida), e "revenue_api_mrr" era
    a receita de ASSINATURA DAS CONSULTORAS, só relabelada como se fosse
    receita de API. Agora usa DeveloperAccount/ApiKey/ApiUsageLog de
    verdade — os mesmos modelos que apps/developers usa.
    """
    from django.db.models import Avg, Count, Q
    from django.db.models.functions import TruncDate
    from datetime import timedelta
    from apps.developers.models import DeveloperAccount, ApiSubscription

    now = timezone.now()
    desde_30d = now - timedelta(days=30)

    total_developers = DeveloperAccount.objects.count()
    chaves = ApiKey.objects.filter(developer__isnull=False).select_related('developer')
    chaves_ativas = chaves.filter(is_active=True).count()

    logs_30d = ApiUsageLog.objects.filter(api_key__developer__isnull=False, created_at__gte=desde_30d)
    total_requests_30d = logs_30d.count()
    erros_30d = logs_30d.filter(status_code__gte=400).count()
    error_rate = round(erros_30d / total_requests_30d * 100, 1) if total_requests_30d else 0.0
    avg_response_time = round(logs_30d.aggregate(m=Avg('response_time_ms'))['m'] or 0, 0)

    # Série diária, últimos 30 dias — pra gráfico de tendência.
    requests_by_day = list(
        logs_30d.annotate(dia=TruncDate('created_at'))
        .values('dia')
        .annotate(total=Count('id'))
        .order_by('dia')
    )

    # Endpoints mais chamados — de verdade, não um catálogo hardcoded.
    top_endpoints = list(
        logs_30d.values('endpoint')
        .annotate(chamadas=Count('id'))
        .order_by('-chamadas')[:10]
    )

    # Uma linha por chave real, com quem é o desenvolvedor dono.
    keys_data = [
        {
            'id': str(k.id),
            'name': k.name,
            'key_prefix': k.key[:12] + '...',
            'developer_name': k.developer.name if k.developer else None,
            'developer_email': k.developer.email if k.developer else None,
            'plan': k.plan,
            'is_active': k.is_active,
            'rate_limit': k.rate_limit,
            'monthly_quota': k.monthly_quota,
            'requests_30d': k.usage_logs.filter(created_at__gte=desde_30d).count(),
            'last_used': k.last_used.isoformat() if k.last_used else None,
        }
        for k in chaves.order_by('-created_at')[:50]
    ]

    # 💰 Fase 4: receita REAL de assinatura de API — mesma tabela de
    # idempotência que a receita de assinatura das consultoras usa
    # (ProcessedPaymentEvent), filtrando pelo lado developer desta vez.
    from inventory.models import ProcessedPaymentEvent
    eventos_api = ProcessedPaymentEvent.objects.filter(developer__isnull=False)
    revenue_api_mrr = eventos_api.filter(
        processed_at__gte=now - timedelta(days=30)
    ).aggregate(s=Sum('value'))['s'] or 0
    assinaturas_ativas = ApiSubscription.objects.filter(expires_at__gt=now).count()

    return Response({
        'total_developers': total_developers,
        'active_keys': chaves_ativas,
        'total_requests_30d': total_requests_30d,
        'error_rate_percent': error_rate,
        'avg_response_time_ms': avg_response_time,
        'requests_by_day': [
            {'date': r['dia'].isoformat(), 'count': r['total']} for r in requests_by_day
        ],
        'top_endpoints': top_endpoints,
        'keys': keys_data,
        'revenue_api_mrr': float(revenue_api_mrr),
        'active_api_subscriptions': assinaturas_ativas,
        'generated_at': now.isoformat(),
        'data_freshness': 'real-time',
    })

# ─────────────────────────────────────────────────────────────
# AÇÕES ADMINISTRATIVAS (Updates Seguros)
# ─────────────────────────────────────────────────────────────

@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def update_plan(request, user_id):
    """
    PATCH /api/admin/users/<id>/plan/ → Altera plano da loja
    Body: {"plan": "free" | "pro"}
    """
    store = Store.objects.filter(owner_id=user_id).first()
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=404)
    
    new_plan = request.data.get('plan')
    if new_plan not in ['free', 'pro']:
        return Response({'error': 'Plano inválido'}, status=400)
    
    store.plan = new_plan
    if new_plan == 'pro':
        store.subscription_started_at = timezone.now()
    else:
        store.subscription_expires_at = None
    store.save()
    
    return Response({'success': True, 'plan': new_plan})


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def update_subscription(request, user_id):
    """
    PATCH /api/admin/users/<id>/subscription/ → Atualiza dados de assinatura
    Body: {"plan", "provider", "external_id", "started_at", "expires_at"}
    """
    store = Store.objects.filter(owner_id=user_id).first()
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=404)
    
    data = request.data
    store.plan = data.get('plan', store.plan)
    store.payment_provider = data.get('provider', store.payment_provider)
    store.payment_external_id = data.get('external_id', store.payment_external_id)
    
    if data.get('started_at'):
        store.subscription_started_at = data['started_at']
    if data.get('expires_at'):
        store.subscription_expires_at = data['expires_at']
        
    store.save()
    return Response({'success': True})

# ==========================================
# 📊 SAÚDE DAS CONSULTORAS (visão do dono)
# ==========================================
# Os indicadores que saíram do Dashboard da consultora vivem aqui: giro de
# estoque, ROI, capital investido, saúde geral. Para ela esses números não
# geravam ação; para quem administra a plataforma, mostram quais consultoras
# estão indo bem e quais precisam de ajuda.

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_consultants_health(request):
    """
    GET /api/admin/analytics/consultants/

    Uma linha por consultora com os indicadores de gestão, além dos totais
    da plataforma. Ordenado por receita nos últimos 30 dias.
    """
    from django.db.models import Sum, F, Q
    from django.utils import timezone
    from datetime import timedelta
    from decimal import Decimal

    from inventory.models import Store, InventoryItem, StockTransaction

    desde = timezone.now() - timedelta(days=30)
    hoje = timezone.now().date()
    linhas = []

    stores = Store.objects.select_related('owner').all()

    for store in stores:
        itens = InventoryItem.objects.filter(store=store).select_related('product')

        investido = Decimal('0')
        potencial = Decimal('0')
        unidades = 0
        estoque_baixo = 0
        for it in itens:
            qtd = it.total_quantity or 0
            unidades += qtd
            investido += (it.cost_price or 0) * qtd
            potencial += (it.sale_price or 0) * qtd
            minimo = it.min_quantity if it.min_quantity is not None else 0
            if qtd <= minimo:
                estoque_baixo += 1

        vendas = StockTransaction.objects.filter(
            store=store, transaction_type='VENDA', created_at__gte=desde
        )
        receita = vendas.aggregate(
            s=Sum(F('unit_price') * (F('quantity') * -1))
        )['s'] or Decimal('0')
        custo_vendido = vendas.aggregate(
            s=Sum(F('unit_cost') * (F('quantity') * -1))
        )['s'] or Decimal('0')
        unidades_vendidas = abs(vendas.aggregate(q=Sum('quantity'))['q'] or 0)
        num_vendas = vendas.count()

        lucro = receita - custo_vendido
        # Giro: quanto do estoque parado virou venda no período.
        giro = float(custo_vendido / investido) if investido else 0.0
        roi = float(lucro / custo_vendido * 100) if custo_vendido else 0.0
        margem = float(lucro / receita * 100) if receita else 0.0
        ticket = float(receita / num_vendas) if num_vendas else 0.0

        # Lotes vencidos e a vencer
        vencidos = 0
        vencendo = 0
        for it in itens:
            for lote in it.batches.all():
                if lote.expiration_date:
                    dias = (lote.expiration_date - hoje).days
                    if dias < 0:
                        vencidos += 1
                    elif dias <= 30:
                        vencendo += 1

        # Saúde: combina atividade de venda, giro e risco de perda.
        # Serve para ordenar quem precisa de atenção — não é nota fiscal.
        saude = 100
        if num_vendas == 0:
            saude -= 40
        if giro < 0.1:
            saude -= 20
        if estoque_baixo > 5:
            saude -= 15
        if vencidos > 0:
            saude -= 15
        if unidades == 0:
            saude -= 10
        saude = max(0, saude)

        linhas.append({
            'store_id': store.id,
            'name': store.name,
            'email': getattr(store.owner, 'email', ''),
            'plan': store.plan,
            'access_status': getattr(store, 'access_status', store.plan),
            'produtos': itens.count(),
            'unidades': unidades,
            'capital_investido': float(investido),
            'valor_potencial': float(potencial),
            'receita_30d': float(receita),
            'lucro_30d': float(lucro),
            'margem_percent': round(margem, 1),
            'roi_percent': round(roi, 1),
            'giro_estoque': round(giro, 2),
            'ticket_medio': round(ticket, 2),
            'vendas_30d': num_vendas,
            'unidades_vendidas_30d': unidades_vendidas,
            'estoque_baixo': estoque_baixo,
            'lotes_vencidos': vencidos,
            'lotes_vencendo': vencendo,
            'saude': saude,
        })

    linhas.sort(key=lambda x: x['receita_30d'], reverse=True)

    total_receita = sum(l['receita_30d'] for l in linhas)
    total_investido = sum(l['capital_investido'] for l in linhas)
    ativas = [l for l in linhas if l['vendas_30d'] > 0]

    return Response({
        'periodo': '30 dias',
        'totais': {
            'consultoras': len(linhas),
            'ativas_30d': len(ativas),
            'inativas_30d': len(linhas) - len(ativas),
            'receita_total_30d': round(total_receita, 2),
            'capital_investido_total': round(total_investido, 2),
            'receita_media_por_consultora': round(
                total_receita / len(ativas), 2) if ativas else 0,
            'em_risco': len([l for l in linhas if l['saude'] < 60]),
        },
        'consultoras': linhas,
    })


# ==========================================
# 🔐 ACESSAR COMO CONSULTORA (suporte)
# ==========================================

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_impersonate_user(request, user_id):
    """
    POST /api/admin/users/<id>/impersonate/

    Emite um token de acesso para a conta da consultora, para o suporte
    conseguir ver a tela exatamente como ela vê.

    ⚠️ Isto dá acesso a DADOS PESSOAIS de terceiros: nomes de clientes finais,
    histórico de vendas, contatos. Por isso:
      • só quem é staff pode chamar;
      • não é possível assumir a conta de outro admin (evita escalar acesso);
      • toda utilização fica registrada no log do servidor;
      • o token dura 30 minutos, não os 60 normais.

    Use apenas para suporte solicitado pela própria consultora.
    """
    from datetime import timedelta

    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import RefreshToken

    User = get_user_model()

    try:
        alvo = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Usuário não encontrado'}, status=404)

    # Um admin não assume a conta de outro admin.
    if alvo.is_staff or alvo.is_superuser:
        return Response(
            {'error': 'Não é possível acessar a conta de outro administrador.'},
            status=403,
        )

    if alvo.id == request.user.id:
        return Response({'error': 'Você já está na sua própria conta.'}, status=400)

    refresh = RefreshToken.for_user(alvo)
    access = refresh.access_token
    access.set_exp(lifetime=timedelta(minutes=30))

    # Marca o token para ser possível auditar depois.
    access['impersonated_by'] = request.user.email
    access['is_impersonation'] = True

    logger.warning(
        f"[IMPERSONATE] {request.user.email} acessou a conta de {alvo.email} "
        f"(user_id={alvo.id})"
    )

    return Response({
        'access': str(access),
        'user': {
            'id': alvo.id,
            'email': alvo.email,
            'display_name': getattr(getattr(alvo, 'store', None), 'name', '') or alvo.email,
        },
        'expires_in_minutes': 30,
        'aviso': 'Sessão de suporte. O acesso fica registrado.',
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_toggle_block_user(request, user_id):
    """
    POST /api/admin/users/<id>/toggle-block/

    Bloqueia ou libera o acesso de uma consultora (`is_active` do Django).
    Uma conta inativa não consegue autenticar.

    ⚠️ Antes, o botão de bloquear no painel só mudava a tela: nada era enviado
    ao servidor. O admin acreditava ter bloqueado alguém que continuava
    entrando normalmente.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        alvo = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Usuário não encontrado'}, status=404)

    if alvo.is_staff or alvo.is_superuser:
        return Response(
            {'error': 'Não é possível bloquear um administrador.'}, status=403
        )

    alvo.is_active = not alvo.is_active
    alvo.save(update_fields=['is_active'])

    logger.warning(
        f"[{'DESBLOQUEIO' if alvo.is_active else 'BLOQUEIO'}] "
        f"{request.user.email} alterou o acesso de {alvo.email}"
    )

    return Response({
        'user_id': alvo.id,
        'email': alvo.email,
        'is_active': alvo.is_active,
        'status': 'liberado' if alvo.is_active else 'bloqueado',
    })

# ─────────────────────────────────────────────────────────────
# 📇 CRM — VISÃO AGREGADA (SEM DADOS DE TERCEIROS)
# ─────────────────────────────────────────────────────────────
# ⚠️ LIMITE FIRME DE LGPD: os clientes finais capturados na vitrine NUNCA
# deram nenhum aceite com o Minha Amora — o consentimento deles é com a
# CONSULTORA, não com a plataforma. Do ponto de vista da plataforma, esses
# clientes são TERCEIROS de uma relação da qual ela não faz parte.
#
# Por isso este endpoint NUNCA devolve nome, telefone, e-mail, data de
# nascimento ou qualquer histórico individual de compra — só CONTAGENS e
# MÉDIAS por loja. Se um dia sentir falta de um número aqui, o teste é
# simples: "dá pra eu identificar UMA pessoa a partir disto?" Se sim, não
# entra.

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_crm_overview(request):
    """
    GET /api/admin/analytics/crm/ — quantos leads cada loja capturou na
    vitrine, taxa de opt-in, ticket médio e recorrência — agregado, sem
    identificar ninguém.
    """
    linhas = []
    for store in Store.objects.select_related('owner').all():
        leads = Lead.objects.filter(store=store)
        total_leads = leads.count()
        if total_leads == 0:
            continue  # loja sem nenhum lead não entra na lista

        opt_in = leads.filter(whatsapp_opt_in=True).count()
        recorrentes = leads.filter(total_orders__gte=2).count()
        ticket_medio = (leads.exclude(total_orders=0)
                         .aggregate(m=Avg('total_spent'))['m']) or 0

        linhas.append({
            'store_id': store.id,
            'store_name': store.name,  # nome da LOJA, não de cliente — ok mostrar
            'total_leads': total_leads,
            'opt_in_rate': round(opt_in / total_leads * 100, 1),
            'clientes_recorrentes': recorrentes,
            'ticket_medio': round(float(ticket_medio), 2),
        })

    linhas.sort(key=lambda x: x['total_leads'], reverse=True)

    return Response({
        'totais': {
            'lojas_com_crm_ativo': len(linhas),
            'leads_capturados': sum(l['total_leads'] for l in linhas),
        },
        'lojas': linhas,
    })

# ─────────────────────────────────────────────────────────────
# ⚙️ CONFIGURAÇÃO GLOBAL (manutenção + feature flags) — de verdade
# ─────────────────────────────────────────────────────────────
# ⚠️ CORREÇÃO GRAVE: "Modo de Manutenção" e "Feature Flags Globais"
# salvavam tudo em localStorage do navegador do PRÓPRIO ADMIN. Não existia
# nenhum endpoint pra isso — o texto "usuários veem tela de manutenção ao
# acessar" nunca foi verdade, porque nada no backend sabia que existia
# manutenção nenhuma. Igual ao que já tínhamos achado com "Salvar
# Promoção": um controle que parecia funcionar, mas não tinha efeito nenhum
# fora do próprio navegador de quem clicou.

@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def update_system_config(request):
    """PATCH /api/admin/system-config/ — liga/desliga manutenção e feature flags globais."""
    cfg = SystemConfig.get_solo()
    data = request.data
    campos = ['maintenance_mode', 'maintenance_message', 'ai_enabled', 'storefront_enabled', 'ocr_enabled']
    alterados = []
    for campo in campos:
        if campo in data:
            setattr(cfg, campo, data[campo])
            alterados.append(campo)
    cfg.save()
    return Response({
        'maintenance_mode': cfg.maintenance_mode,
        'maintenance_message': cfg.maintenance_message,
        'ai_enabled': cfg.ai_enabled,
        'storefront_enabled': cfg.storefront_enabled,
        'ocr_enabled': cfg.ocr_enabled,
        'updated_fields': alterados,
    })

# ─────────────────────────────────────────────────────────────
# 💰 PLANOS DE API (Fase 4) — mesmo padrão do plan-configs das consultoras
# ─────────────────────────────────────────────────────────────

def _serialize_api_plan_config(c):
    return {
        'plan_type': c.plan_type,
        'display_name': c.display_name,
        'monthly_price': float(c.monthly_price),
        'yearly_price': float(c.yearly_price),
        'monthly_quota': c.monthly_quota,
        'rate_limit': c.rate_limit,
        'is_visible': c.is_visible,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def list_api_plan_configs(request):
    """GET /api/admin/api-plan-configs/"""
    from apps.developers.models import ApiPlanConfig
    configs = ApiPlanConfig.objects.all().order_by('monthly_price')
    return Response([_serialize_api_plan_config(c) for c in configs])


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def update_api_plan_config(request, plan_type):
    """
    PATCH /api/admin/api-plan-configs/<plan_type>/

    Mesmo elo que update_plan_config já tem pras consultoras: mudar
    monthly_price/yearly_price aqui reflete direto no checkout
    (asaas_service.create_developer_payment_link) e em /api/pricing.
    """
    from apps.developers.models import ApiPlanConfig
    config = ApiPlanConfig.objects.filter(plan_type=plan_type).first()
    if not config:
        return Response({'error': f"Plano de API '{plan_type}' não encontrado."}, status=404)

    editable_decimal = {'monthly_price', 'yearly_price'}
    editable_int = {'monthly_quota', 'rate_limit'}
    editable_bool = {'is_visible'}
    editable_str = {'display_name'}

    data = request.data or {}
    errors = {}
    for field, value in data.items():
        try:
            if field in editable_decimal:
                setattr(config, field, Decimal(str(value)))
            elif field in editable_int:
                setattr(config, field, int(value))
            elif field in editable_bool:
                setattr(config, field, bool(value))
            elif field in editable_str:
                setattr(config, field, str(value)[:50])
            # campos fora dessas listas são ignorados silenciosamente —
            # mesma postura de segurança do update_plan_config.
        except (ValueError, TypeError):
            errors[field] = 'Valor inválido'

    if errors:
        return Response({'error': 'Campos inválidos', 'details': errors}, status=400)

    config.save()
    return Response(_serialize_api_plan_config(config))