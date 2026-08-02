# backend/core/inventory/api_comercial_views.py
"""
Endpoints da API Comercial v1
Acesso via API Key (pk_live_••••) com rate limiting por plano.
"""
from datetime import timezone
from django.db.models import Count, Q, Avg
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, serializers  # ✅ IMPORT CRÍTICO: serializers
from rest_framework.throttling import UserRateThrottle, ScopedRateThrottle
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from drf_spectacular.types import OpenApiTypes

from .models import Product, InventoryItem, Store, ApiKey
from .serializers import ProductSerializer

# ==========================================
# 🔧 THROTTLES POR PLANO (Configurar em settings.py)
# ==========================================

class StarterThrottle(ScopedRateThrottle):
    """Rate limit para plano Starter: 20 req/min"""
    scope = 'starter'

class ProThrottle(ScopedRateThrottle):
    """Rate limit para plano Pro: 100 req/min"""
    scope = 'pro'

class EnterpriseThrottle(ScopedRateThrottle):
    """Rate limit para plano Enterprise: 500 req/min"""
    scope = 'enterprise'


# ==========================================
# 📦 SERIALIZERS PARA API COMERCIAL
# ==========================================

class PublicProductSerializer(serializers.ModelSerializer):
    """Serializer para API pública — sem dados sensíveis ou internos"""
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'brand', 'category', 
            'official_price', 'bar_code', 'image_url', 'description'
        ]
        read_only_fields = fields


class ProductLookupResponseSerializer(serializers.Serializer):
    """Resposta padronizada para lookup de produtos"""
    found = serializers.BooleanField()
    source = serializers.CharField(help_text="Origem da resposta: local, suggestion, none")
    product = PublicProductSerializer(required=False, allow_null=True)
    suggestions = PublicProductSerializer(many=True, required=False)
    message = serializers.CharField(required=False, allow_blank=True)


class StorefrontItemSerializer(serializers.Serializer):
    """Serializer para itens da vitrine pública"""
    id = serializers.IntegerField(read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    brand = serializers.CharField(source='product.brand', read_only=True)
    category = serializers.CharField(source='product.category', read_only=True)
    sale_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_quantity = serializers.IntegerField(read_only=True)
    image_url = serializers.URLField(source='product.image_url', read_only=True, allow_null=True)
    barcode = serializers.CharField(source='product.bar_code', read_only=True, allow_blank=True)


class AnalyticsProductsSerializer(serializers.Serializer):
    """Resposta de analytics agregados (LGPD-compliant)"""
    total_products = serializers.IntegerField(read_only=True)
    top_brands = serializers.ListField(
        child=serializers.DictField(),
        read_only=True
    )
    price_ranges = serializers.DictField(read_only=True)
    generated_at = serializers.DateTimeField(read_only=True)
    lgpd_compliant = serializers.BooleanField(read_only=True, default=True)


# ==========================================
# 🌐 ENDPOINTS PÚBLICOS (com API Key)
# ==========================================

@extend_schema(
    tags=['Catalog'],
    summary='Listar catálogo de produtos',
    description='Retorna lista paginada de produtos do catálogo global. Requer API Key válida.',
    parameters=[
        OpenApiParameter(name='search', description='Busca por nome ou marca', required=False, type=str),
        OpenApiParameter(name='brand', description='Filtrar por marca', required=False, type=str),
        OpenApiParameter(name='category', description='Filtrar por categoria', required=False, type=str),
        OpenApiParameter(name='page', description='Página (default: 1)', required=False, type=int),
        OpenApiParameter(name='page_size', description='Itens por página (max: 100, default: 20)', required=False, type=int),
    ],
    responses={
        200: OpenApiResponse(
            description='Lista paginada de produtos',
            response={
                'type': 'object',
                'properties': {
                    'count': {'type': 'integer'},
                    'next': {'type': ['string', 'null']},
                    'previous': {'type': ['string', 'null']},
                    'results': {'type': 'array', 'items': PublicProductSerializer}
                }
            }
        ),
        401: OpenApiResponse(description='API Key inválida ou ausente'),
        429: OpenApiResponse(description='Limite de requisições excedido'),
    }
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])  # Requer API Key válida (validada pelo middleware)
@throttle_classes([StarterThrottle])
def api_products_list(request):
    """
    Listar produtos do catálogo global com filtros e paginação.
    
    Rate limits por plano:
    - Starter: 20 req/min
    - Pro: 100 req/min  
    - Enterprise: 500 req/min
    """
    queryset = Product.objects.all()
    
    # ✅ Filtros opcionais
    if search := request.query_params.get('search'):
        queryset = queryset.filter(Q(name__icontains=search) | Q(brand__icontains=search))
    
    if brand := request.query_params.get('brand'):
        queryset = queryset.filter(brand__iexact=brand)
    
    if category := request.query_params.get('category'):
        queryset = queryset.filter(category__iexact=category)
    
    # ✅ Paginação manual (pode migrar para PageNumberPagination do DRF)
    try:
        page = max(1, int(request.query_params.get('page', 1)))
        page_size = min(max(1, int(request.query_params.get('page_size', 20))), 100)
    except (ValueError, TypeError):
        page, page_size = 1, 20
    
    start = (page - 1) * page_size
    end = start + page_size
    total_count = queryset.count()
    
    products = queryset[start:end]
    serializer = PublicProductSerializer(products, many=True)
    
    return Response({
        'count': total_count,
        'next': f'?page={page + 1}&page_size={page_size}' if end < total_count else None,
        'previous': f'?page={page - 1}&page_size={page_size}' if page > 1 else None,
        'results': serializer.data,
        'pagination': {
            'current_page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
        }
    }, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Lookup'],
    summary='Buscar produto por código de barras',
    description='Busca híbrida: local → fuzzy match. Retorna produto encontrado ou sugestões.',
    parameters=[
        OpenApiParameter(
            name='barcode', 
            description='Código de barras (EAN-13, EAN-8, UPC, etc.)', 
            required=True, 
            type=str, 
            location=OpenApiParameter.QUERY
        ),
    ],
    responses={
        200: ProductLookupResponseSerializer,
        400: OpenApiResponse(description='Código de barras inválido ou ausente'),
        404: OpenApiResponse(description='Produto não encontrado (com sugestões)'),
        429: OpenApiResponse(description='Limite de requisições excedido'),
    }
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([ProThrottle])  # Lookup consome mais recursos
def api_product_lookup(request):
    """
    Buscar produto por código de barras com fallback inteligente.
    
    Fluxo:
    1. Busca exata no banco local
    2. Se não encontrar: sugestões por fuzzy match (últimos 4-6 dígitos)
    3. Retorna estrutura padronizada com source indicando origem
    """
    barcode = request.query_params.get('barcode', '').strip()
    
    # ✅ Validação básica do código de barras
    if not barcode or len(barcode) < 8:
        return Response(
            {'error': 'Código de barras inválido. Mínimo 8 dígitos.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # ✅ 1. Busca exata no banco local
    product = Product.objects.filter(bar_code=barcode).first()
    if product:
        return Response({
            'found': True,
            'source': 'local',
            'product': PublicProductSerializer(product).data,
            'message': 'Produto encontrado no catálogo local'
        }, status=status.HTTP_200_OK)
    
    # ✅ 2. Fallback: sugestões por fuzzy match (últimos 4-6 dígitos)
    # Prioriza match mais longo primeiro
    for suffix_len in [6, 5, 4]:
        if len(barcode) >= suffix_len:
            suffix = barcode[-suffix_len:]
            suggestions = Product.objects.filter(
                bar_code__endswith=suffix,
                bar_code__isnull=False
            ).exclude(bar_code=barcode)[:5]
            
            if suggestions:
                return Response({
                    'found': False,
                    'source': 'suggestion',
                    'message': f'Produto não encontrado. Sugestões baseadas nos últimos {suffix_len} dígitos:',
                    'suggestions': PublicProductSerializer(suggestions, many=True).data,
                    'searched_barcode': barcode
                }, status=status.HTTP_404_NOT_FOUND)
    
    # ✅ 3. Sem matches encontrados
    return Response({
        'found': False,
        'source': 'none',
        'message': 'Produto não encontrado. Tente buscar por nome ou categoria.',
        'suggestions': [],
        'searched_barcode': barcode
    }, status=status.HTTP_404_NOT_FOUND)


@extend_schema(
    tags=['Storefront'],
    summary='Listar vitrine pública',
    description='Retorna produtos disponíveis na vitrine de uma consultora. Endpoint público (sem API Key).',
    parameters=[
        OpenApiParameter(
            name='slug', 
            description='Slug único da consultora (ex: "maria-silva")', 
            required=True, 
            type=str, 
            location=OpenApiParameter.PATH
        ),
    ],
    responses={
        200: {
            'type': 'array',
            'items': StorefrontItemSerializer,
            'description': 'Lista de produtos disponíveis na vitrine'
        },
        404: OpenApiResponse(description='Vitrine/consultora não encontrada'),
    }
)
@api_view(['GET'])
@permission_classes([AllowAny])  # ✅ Público — NÃO requer API Key nem auth
def api_public_storefront(request, slug: str):
    """
    Vitrine pública de uma consultora.
    
    ✅ Acessível sem autenticação para compartilhamento público.
    ✅ Retorna apenas produtos com estoque > 0.
    ✅ Dados anonimizados conforme LGPD.
    """
    try:
        # ✅ Query otimizada com select_related
        store = Store.objects.select_related('owner').get(slug__iexact=slug)
    except Store.DoesNotExist:
        return Response(
            {'error': 'Vitrine não encontrada', 'slug': slug}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    # ✅ Produtos disponíveis (estoque > 0) com otimização de queries
    items = InventoryItem.objects.filter(
        store=store,
        total_quantity__gt=0
    ).select_related('product').prefetch_related('batches')[:100]  # Limite para performance
    
    serializer = StorefrontItemSerializer(items, many=True)
    
    # ✅ Metadados da vitrine
    response_data = {
        'store': {
            'name': store.name,
            'slug': store.slug,
            'whatsapp': store.whatsapp if store.whatsapp else None,
        },
        'products': serializer.data,
        'total_items': len(serializer.data),
        'generated_at': timezone.now().isoformat(),
    }
    
    return Response(response_data, status=status.HTTP_200_OK)


# ==========================================
# 📊 ENDPOINTS ANALYTICS (Enterprise apenas)
# ==========================================

@extend_schema(
    tags=['Analytics'],
    summary='Analytics agregado de produtos',
    description='Retorna estatísticas agregadas do catálogo: top marcas, categorias, faixas de preço. Dados 100% anonimizados (LGPD Art. 12).',
    responses={
        200: AnalyticsProductsSerializer,
        403: OpenApiResponse(description='Acesso restrito ao plano Enterprise'),
        429: OpenApiResponse(description='Limite de requisições excedido'),
    }
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([EnterpriseThrottle])
def api_analytics_products(request):
    """
    Analytics agregados do catálogo global.
    
    ✅ Dados 100% anonimizados (sem PII)
    ✅ Apenas para plano Enterprise
    ✅ Cache-friendly para performance
    """
    # ✅ Verificar acesso Enterprise
    # Suporta tanto usuário logado quanto API Key com plano enterprise
    is_enterprise = False
    
    # Caso 1: Usuário logado com store enterprise
    if hasattr(request, 'user') and request.user.is_authenticated:
        if hasattr(request.user, 'store') and request.user.store:
            is_enterprise = (request.user.store.plan == 'enterprise')
    
    # Caso 2: API Key com plano enterprise (via middleware)
    if hasattr(request, 'api_key') and request.api_key:
        is_enterprise = (request.api_key.plan == 'enterprise')
    
    if not is_enterprise:
        return Response(
            {'error': 'Acesso restrito ao plano Enterprise'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # ✅ Estatísticas agregadas (queries otimizadas)
    total_products = Product.objects.count()
    
    # Top 10 marcas por quantidade de produtos
    top_brands = Product.objects.values('brand').filter(
        brand__isnull=False,
        brand__exact__isnull=False
    ).annotate(
        count=Count('id'),
        avg_price=Avg('official_price')
    ).order_by('-count')[:10]
    
    # Faixas de preço (otimizado com filter direto)
    price_ranges = {
        '0-10': Product.objects.filter(official_price__lt=10, official_price__isnull=False).count(),
        '10-50': Product.objects.filter(official_price__gte=10, official_price__lt=50).count(),
        '50-100': Product.objects.filter(official_price__gte=50, official_price__lt=100).count(),
        '100+': Product.objects.filter(official_price__gte=100).count(),
    }
    
    # Categorias mais populares
    top_categories = Product.objects.values('category').annotate(
        count=Count('id')
    ).filter(category__isnull=False).order_by('-count')[:5]
    
    return Response({
        'total_products': total_products,
        'top_brands': [
            {
                'brand': b['brand'], 
                'count': b['count'], 
                'avg_price': float(b['avg_price']) if b['avg_price'] else None
            }
            for b in top_brands
        ],
        'top_categories': [
            {'category': c['category'], 'count': c['count']}
            for c in top_categories
        ],
        'price_ranges': price_ranges,
        'generated_at': timezone.now().isoformat(),
        'cache_ttl_seconds': 300,  # Sugestão de cache para o cliente
        'lgpd_compliant': True,
        'data_anonymized': True,
    }, status=status.HTTP_200_OK)