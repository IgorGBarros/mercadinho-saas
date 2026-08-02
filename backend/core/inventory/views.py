# ==========================================
# IMPORTS GERAIS - CORRIGIDOS
# ==========================================
from time import time
from django.db import models, transaction
from django.db.models import Q, Count, Sum, F, Prefetch
from django.utils import timezone
from django.utils.crypto import get_random_string  # ✅ IMPORT CORRETO
from django.utils.text import slugify
from django.conf import settings  # ✅ IMPORT CORRETO
from django.shortcuts import get_object_or_404
from django.core.paginator import Paginator
from django_filters.rest_framework import DjangoFilterBackend

from rest_framework import viewsets, status, permissions, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, action, authentication_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

import re
import hashlib  # ✅ Para hash de dados sensíveis
import traceback

# Imports do Django Auth
from django.contrib.auth import authenticate, get_user_model, login
from django.core.cache import cache  

# Imports dos seus modelos
from .models import (
    CustomUser, RegistrationSession, ThemeConfig,
    Product, Store, InventoryItem, InventoryBatch,
    Sale, SaleItem, PriceHistory, StockTransaction,
    PlanConfig, Promotion, ConsentRecord,  # ✅ Novo modelo LGPD
    Lead, Cart, CartItem,  # ✅ CRM da vitrine
    SystemConfig, PromotionView,  # ⚙️ Configuração global + métricas reais de promoção
)

# Imports dos seus serializers
from .serializers import (
    CustomTokenObtainPairSerializer, CustomUserSerializer,
    ProfileSerializer, ThemeConfigSerializer,
    ProductSerializer, InventoryItemSerializer,
    StockEntrySerializer, SaleSerializer, StockTransactionSerializer,
    ConsentRecordSerializer, ConsentRevocationSerializer, ConsentSummarySerializer,  # ✅ Serializers LGPD
    PlanConfigSerializer,
    LeadSerializer, CartItemSerializer,  # ✅ CRM da vitrine
    PromotionSerializer,
)


from .consent_utils import has_consent_for_purpose as _has_consent_for_purpose
from decimal import Decimal, InvalidOperation
from django.db.models.functions import Abs  # usado no fluxo de caixa MEI

User = get_user_model()
# ============================================================================
# 1. AUTHENTICATION VIEWS
# ============================================================================

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

# ==========================================
# 1. AUTHENTICATION VIEWS - VERSÃO LGPD
# ==========================================

class CustomUserCreateView(generics.CreateAPIView):
    """
    Cadastro de usuário com registro AUTOMÁTICO de consentimento LGPD (Art. 8º)
    """
    queryset = CustomUser.objects.all()
    serializer_class = CustomUserSerializer
    permission_classes = [AllowAny]
    
    def perform_create(self, serializer):
        """
        ✅ Cria usuário E registra consentimento LGPD automaticamente
        """
        # 1. Cria o usuário normalmente
        user = serializer.save()
        
        # 2. Coleta dados para auditoria (anonimizados)
        ip_address = self.request.META.get(
            'HTTP_X_FORWARDED_FOR', 
            self.request.META.get('REMOTE_ADDR', '')
        )
        user_agent = self.request.META.get('HTTP_USER_AGENT', '')[:500]  # Limita tamanho
        
        # 3. Define finalidades ESSENCIAIS para cadastro (não podem ser revogadas)
        essential_purposes = ['essential', 'authentication', 'service_delivery']
        
        # 4. Cria registro de consentimento
        try:
            consent = ConsentRecord.objects.create(
                user=user,
                email=user.email.lower(),
                ip_hash=ConsentRecord.hash_ip(ip_address),  # Hash do IP para LGPD
                purpose_flags=essential_purposes,
                term_version=getattr(settings, 'LGPD_CONSENT_VERSION', 'v1.0_2026-05'),
                accepted_at=timezone.now(),
                user_agent=user_agent
            )
            log_safe(
                "Consentimento registrado no cadastro", 
                user_id=user.id, 
                purposes=essential_purposes
            )
        except Exception as e:
            # Se falhar ao registrar consentimento, ainda cria o usuário
            # Mas loga o erro para correção posterior
            log_safe(
                "Erro ao registrar consentimento no cadastro", 
                user_id=user.id, 
                error=str(e)
            )
            # Opcional: você pode decidir NÃO criar o usuário se consentimento falhar
            # if not consent:
            #     user.delete()
            #     raise ValidationError("Não foi possível registrar seu consentimento")
        
        # 5. Cria loja automaticamente para o novo usuário
        try:
            ensure_user_has_store(user)
        except Exception as e:
            log_safe("Erro ao criar loja no cadastro", user_id=user.id, error=str(e))

# backend/core/inventory/views.py - FirebaseLoginView COMPLETA

import os
import json
import re
import logging
from django.conf import settings
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

# Firebase imports
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

from .models import CustomUser
from .utils import ensure_user_has_store

logger = logging.getLogger(__name__)
# backend/core/inventory/views.py - FirebaseLoginView COMPLETA E ROBUSTA

import os
import json
import re
import logging
from django.conf import settings
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

# Firebase imports
from firebase_admin import auth as firebase_auth

from .models import CustomUser
from .utils import ensure_user_has_store
from .firebase_utils import init_firebase_safe

logger = logging.getLogger(__name__)


class FirebaseLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token = request.data.get("token")
        if not token:
            return Response({"error": "Token ausente"}, status=400)
        
        # Inicializar Firebase AGORA (na request, não no startup)
        if not init_firebase_safe():
            # Fallback para DEBUG: mock user
            if settings.DEBUG:
                user, _ = CustomUser.objects.get_or_create(
                    email="mock@example.com",
                    defaults={"name": "Mock", "is_active": True}
                )
                user.set_unusable_password()
                user.save()
                store = ensure_user_has_store(user)
                refresh = RefreshToken.for_user(user)
                return Response({
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user": {"email": user.email, "name": user.name},
                    "store": {"plan": "free"} if store else None,
                    "_debug": "Firebase mock (DEBUG mode)"
                })
            return Response({"error": "Firebase não configurado"}, status=503)
        
        # Verificar token
        try:
            decoded = firebase_auth.verify_id_token(token)
        except Exception as e:
            logger.error(f"❌ Token verify error: {type(e).__name__}: {str(e)[:100]}")
            return Response({"error": "Token inválido"}, status=401)
        
        # Criar usuário
        email = decoded.get("email")
        if not email:
            return Response({"error": "Email não encontrado"}, status=400)
        
        name = decoded.get("name", email.split("@")[0])
        user, created = CustomUser.objects.get_or_create(
            email=email,
            defaults={"name": name, "is_active": True}
        )
        if created:
            user.set_unusable_password()
            user.save()
        
        # Loja
        store = ensure_user_has_store(user)
        
        # JWT
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token
        access["email"] = user.email
        if store:
            access["plan"] = store.plan
        
        return Response({
            "access": str(access),
            "refresh": str(refresh),
            "user": {"email": user.email, "name": user.name},
            "store": {"plan": store.plan} if store else None,
        })
# ==========================================
# UTILITÁRIOS LGPD - ANONIMIZAÇÃO E SEGURANÇA
# ==========================================

def hash_for_lgpd(value: str, salt_key: str = 'LGPD_SALT') -> str:
    """
    Gera hash SHA-256 para anonimização de dados pessoais (LGPD Art. 12)
    Uso: hash_for_lgpd(user.email) ou hash_for_lgpd(ip, 'LGPD_IP_SALT')
    """
    if not value:
        return ''
    salt = getattr(settings, salt_key, settings.SECRET_KEY[:32])
    return hashlib.sha256(f"{value}{salt}".encode('utf-8')).hexdigest()


def log_safe(message: str, **context):
    """
    Log que anonimiza automaticamente dados sensíveis no contexto
    Uso: log_safe("Login attempt", user_email=user.email, ip_address=ip)
    """
    safe_context = {}
    for key, value in context.items():
        if any(sensitive in key.lower() for sensitive in ['email', 'ip', 'phone', 'cpf', 'name', 'user_agent']):
            safe_context[key] = hash_for_lgpd(str(value))
        else:
            safe_context[key] = value
    # Só loga em DEBUG ou desenvolvimento
    if settings.DEBUG:
        print(f"[SAFE_LOG] {message}", **safe_context)


def has_consent_for_purpose(user, purpose: str) -> bool:
    """
    Verifica se usuário consentiu com finalidade específica (LGPD Art. 8º)

    Movida para consent_utils.py (fonte única, compartilhada com
    admin_views.py e com o módulo de exportação para treino de IA).
    Mantida como re-export aqui para não quebrar `from inventory.views
    import has_consent_for_purpose`, já usado em outros lugares (ex: ai/views.py).
    """
    return _has_consent_for_purpose(user, purpose)
# ============================================================================
# 2. CORE BUSINESS (ESTOQUE)
# ============================================================================


# Imports Locais
from .models import (
    Product, Store, InventoryItem, InventoryBatch, 
    Sale, SaleItem, PriceHistory, StockTransaction
)
from .serializers import (
    ProductSerializer, InventoryItemSerializer, 
    StockEntrySerializer, SaleSerializer, StockTransactionSerializer
)

# ==========================================
# 0. HELPERS & MIXINS MULTI-TENANT
# ==========================================

def get_current_store(user):
    """
    ✅ Versão atualizada com fallback e logs de auditoria
    """
    try:
        # Log de segurança (anonimizado se necessário)
        print(f"🔍 get_current_store: Usuário {user.id if user else 'Anon'}")
        
        if not user or not user.id:
            print("❌ Usuário inválido ou sem ID")
            return None
        
        # Estratégia 1: Buscar por relacionamento owner
        try:
            store = Store.objects.filter(owner=user).first()
            if store:
                print(f"✅ Loja encontrada (owner): {store.id}")
                return store
        except Exception as e:
            print(f"⚠️ Erro busca owner: {e}")
        
        # Estratégia 2: Buscar por owner_id direto
        try:
            stores = Store.objects.filter(owner_id=user.id)
            if stores.exists():
                store = stores.first()
                print(f"✅ Loja encontrada (owner_id): {store.id}")
                return store
        except Exception as e:
            print(f"⚠️ Erro busca owner_id: {e}")
        
        # Estratégia 3: FALLBACK - Criar loja automaticamente
        print(f"🏪 Criando loja automática para {user.email}")
        try:
            store = Store.objects.create(
                name=f"Loja de {user.email}",
                owner=user,
                slug=f"loja-{user.id}-{int(time())}",
                plan="free"
            )
            print(f"✅ Loja criada: {store.id}")
            return store
        except Exception as create_error:
            print(f"❌ Erro ao criar loja: {create_error}")
            
            # 🚨 ESTRATÉGIA 4 (PERIGOSA - LEAKAGE):
            # A linha abaixo foi comentada para evitar vazamento de dados entre usuários.
            # Se descomentar, um erro na criação pode expor a loja de outro cliente.
            
            # try:
            #     first_store = Store.objects.first()
            #     if first_store:
            #         print(f"⚠️ Usando primeira loja disponível: {first_store.id}")
            #         return first_store
            # except Exception: pass
            
            # Retorno seguro: Se não achou e não criou, retorna None
            return None
        
    except Exception as e:
        print(f"❌ Erro geral get_current_store: {e}")
        traceback.print_exc()
        return None


def ensure_user_has_store(user):
    """
    ✅ Garante que o usuário tenha uma loja, lançando erro se falhar
    """
    try:
        store = get_current_store(user)
        
        if not store:
            print(f"🏪 Tentativa secundária de criação para {user.email}")
            try:
                store = Store.objects.create(
                    owner=user,
                    name=f"Loja de {user.email}",
                    slug=slugify(f"loja-{user.id}"),
                    storefront_enabled=True,
                    plan="free"
                )
                print(f"✅ Loja criada via ensure: {store.id}")
            except Exception as create_error:
                print(f"❌ Falha crítica ao garantir loja: {create_error}")
                # Retorna None para que a View trate o erro (ex: 403 Forbidden)
                return None
        
        return store
    
    except Exception as e:
        print(f"❌ Erro ensure_user_has_store: {e}")
        traceback.print_exc()
        raise
# inventory/mixins.py ou views.py

class TenantModelMixin:
    """Mixin tenant-aware com validação de limites"""
    permission_classes = [IsAuthenticated]
    
    def get_store(self):
        return ensure_user_has_store(self.request.user)
    
    def get_queryset(self):
        try:
            store = self.get_store()
            return InventoryItem.objects.filter(store=store).select_related('product')
        except Exception as e:
            print(f"❌ Erro no get_queryset: {e}")
            return InventoryItem.objects.none()
    
    def perform_create(self, serializer):
        store = self.get_store()


        
        # VALIDAÇÃO DE LIMITE (novo)
        if hasattr(self, 'check_plan_limits'):
            self.check_plan_limits(store)
        
        serializer.save(store=store)
    
    def check_plan_limits(self, store):
        """Valida limites do plano antes de criar"""
        if not store.can_add_products:
            from rest_framework.exceptions import ValidationError
            
            config = store.plan_config
            limit = config.max_products if config else 20
            
            raise ValidationError({
                'error': 'PLAN_LIMIT_REACHED',
                'message': f'Você atingiu o limite de {limit} produtos do plano {store.plan.upper()}.',
                'current_plan': store.plan,
                'current_count': store.product_count,
                'limit': limit
            })

# Usar no ViewSet de produtos:
class InventoryItemViewSet(TenantModelMixin, viewsets.ModelViewSet):
    # ... seu código atual ...
    
    def create(self, request, *args, **kwargs):
        """Override para validar limites"""
        store = self.get_store()
        self.check_plan_limits(store)  # Valida antes de criar
        
        return super().create(request, *args, **kwargs)


# ==========================================
# 1. VIEWSETS BASE (CRUD)
# ==========================================

class ProductViewSet(viewsets.ModelViewSet):
    """Catálogo Global - Leitura livre, Edição apenas de itens não protegidos"""
    permission_classes = [AllowAny]    
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    # ✅ Mesmo motivo do InventoryViewSet e do StockTransactionViewSet: o
    # frontend (productService.ts) faz `data.map(...)` esperando um ARRAY
    # puro. A paginação global do DRF embrulharia em {count, results} e
    # quebraria com "data.map is not a function".
    #
    # ⚠️ Diferença importante: aqui é o catálogo GLOBAL (compartilhado por
    # todas as lojas), não o estoque de uma consultora — pode crescer muito
    # mais que "algumas dezenas de itens". Se o catálogo passar de alguns
    # milhares de produtos, isto vai devolver a lista inteira em toda
    # chamada. Quando isso incomodar, o caminho é paginar de propósito E
    # atualizar productService.ts para ler `.results` em vez de tratar a
    # resposta como array direto — as duas pontas têm que mudar juntas.
    pagination_class = None

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # 🚀 PROTEÇÃO: Impede que o usuário altere o catálogo oficial da Natura,
        # mas permite que ele altere os produtos que ele mesmo cadastrou manualmente.
        is_protected = getattr(instance, 'is_protected', False)
        if is_protected:
            # Retorna 200 OK para não quebrar o frontend, mas não faz a alteração no banco global
            return Response(
                {"message": "Produto protegido. Alterações no catálogo global foram ignoradas."}, 
                status=status.HTTP_200_OK
            )
            
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

from django.db.models import Sum, Prefetch
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response




from django.db.models import Sum, Prefetch
from django.utils import timezone
from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend

# inventory/views.py - IMPLEMENTAR ESTAS CORREÇÕES

class InventoryViewSet(TenantModelMixin, viewsets.ModelViewSet):
    """Estoque Privado da Consultora - VERSÃO CORRIGIDA"""
    serializer_class = InventoryItemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['product__category']
    # ✅ O frontend inteiro espera um ARRAY puro desta rota (data.length,
    # .map, .filter). A paginação global do DRF (settings) embrulhava em
    # {count, results} e quebrava a tela de estoque. Estoques de consultora
    # são pequenos (dezenas de itens), então resposta sem paginação é ok.
    pagination_class = None

    # ✅ GET /api/inventory/by-barcode/<code>/ — o frontend (lib/api.ts) já
    # chamava esta rota, mas ela nunca existiu no backend (Auditoria P0.1).
    @action(detail=False, methods=['get'], url_path='by-barcode/(?P<barcode>[^/]+)')
    def by_barcode(self, request, barcode=None):
        item = self.get_queryset().filter(product__bar_code=barcode).first()
        if not item:
            return Response({'detail': 'Produto não encontrado no seu estoque.'},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(item).data)

    # ✅ GET /api/inventory/<id>/batches/ — idem: chamado pelo frontend, sem rota.
    @action(detail=True, methods=['get'])
    def batches(self, request, pk=None):
        from .serializers import InventoryBatchSerializer
        item = self.get_object()  # get_object usa get_queryset → já filtra por loja
        qs = item.batches.filter(quantity__gt=0).order_by('expiration_date', 'entry_date')
        return Response(InventoryBatchSerializer(qs, many=True).data)

    def get_queryset(self):
        """Queryset com tratamento de erro robusto"""
        try:
            store = get_current_store(self.request.user)
            return InventoryItem.objects.filter(store=store).select_related('product').prefetch_related(
                # ✅ CORREÇÃO: Ordenar lotes por validade (FIFO) e incluir apenas com estoque
                Prefetch(
                    'batches', 
                    queryset=InventoryBatch.objects.filter(quantity__gt=0).order_by('expiration_date', 'id')
                )
            ).order_by('-updated_at')
        except Exception as e:
            print(f"❌ Erro no get_queryset Inventory: {e}")
            return InventoryItem.objects.none()

    def consolidate_batches_by_expiry(self, inventory_item):
        """✅ NOVO: Consolida lotes com a mesma data de validade"""
        from collections import defaultdict
        
        print(f"🔄 Consolidando lotes para {inventory_item.product.name}")
        
        # Agrupar lotes por data de validade
        batches_by_date = defaultdict(list)
        
        for batch in inventory_item.batches.filter(quantity__gt=0):
            date_key = batch.expiration_date.isoformat() if batch.expiration_date else 'no_date'
            batches_by_date[date_key].append(batch)
        
        # Consolidar lotes duplicados
        consolidated_count = 0
        for date_key, batches in batches_by_date.items():
            if len(batches) > 1:
                print(f"🔄 Consolidando {len(batches)} lotes com validade {date_key}")
                
                # Manter o primeiro lote e somar as quantidades
                main_batch = batches[0]
                total_quantity = sum(batch.quantity for batch in batches)
                
                # Atualizar quantidade do lote principal
                main_batch.quantity = total_quantity
                main_batch.save()
                
                # Remover lotes duplicados
                for batch in batches[1:]:
                    print(f"🗑️ Removendo lote duplicado {batch.id}")
                    batch.delete()
                
                consolidated_count += 1
        
        if consolidated_count > 0:
            print(f"✅ Consolidados {consolidated_count} grupos de lotes")
            
            # Recalcular total
            total_real = inventory_item.batches.aggregate(
                total=Sum('quantity')
            )['total'] or 0
            
            inventory_item.total_quantity = total_real
            inventory_item.save()
        
        return inventory_item

    def list(self, request, *args, **kwargs):
        """Lista com tratamento de erro robusto e consolidação automática"""
        try:
            print("📦 Iniciando listagem do inventário...")
            
            queryset = self.filter_queryset(self.get_queryset())
            
            if not queryset.exists():
                print("📦 Nenhum item encontrado no inventário")
                return Response([])
            
            print(f"📦 Encontrados {queryset.count()} itens no inventário")
            
            # ✅ Consolidar e corrigir totais (limitado para performance)
            items_to_process = queryset[:15]  # Limitar para evitar timeout
            corrected_count = 0
            consolidated_count = 0
            
            for item in items_to_process:
                try:
                    # ✅ NOVO: Consolidar lotes primeiro
                    old_batch_count = item.batches.filter(quantity__gt=0).count()
                    item = self.consolidate_batches_by_expiry(item)
                    new_batch_count = item.batches.filter(quantity__gt=0).count()
                    
                    if old_batch_count != new_batch_count:
                        consolidated_count += 1
                    
                    # Verificar e corrigir totais
                    active_batches = item.batches.filter(quantity__gt=0)
                    total_real = active_batches.aggregate(total=Sum('quantity'))['total'] or 0
                    
                    if item.total_quantity != total_real:
                        print(f"🔄 Corrigindo total de {item.product.name}: {item.total_quantity} → {total_real}")
                        item.total_quantity = total_real
                        item.save()
                        corrected_count += 1
                        
                except Exception as e:
                    print(f"⚠️ Erro ao processar item {item.id}: {e}")
                    continue
            
            if corrected_count > 0:
                print(f"✅ Corrigidos {corrected_count} totais desatualizados")
            if consolidated_count > 0:
                print(f"✅ Consolidados lotes em {consolidated_count} produtos")
            
            # Paginação
            page = self.paginate_queryset(queryset)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
            
            serializer = self.get_serializer(queryset, many=True)
            data = serializer.data
            
            print(f"✅ Inventário serializado: {len(data)} itens")
            return Response(data)
            
        except Exception as e:
            print(f"❌ Erro crítico no list do inventário: {e}")
            import traceback
            traceback.print_exc()
            
            return Response({
                'error': 'Erro ao carregar inventário',
                'message': str(e),
                'fallback': []
            }, status=200)

    def retrieve(self, request, *args, **kwargs):
        """Detalhes com consolidação automática e FIFO"""
        try:
            print(f"🔍 Buscando detalhes do item {kwargs.get('pk')}")
            
            instance = self.get_object()
            
            # ✅ CONSOLIDAR lotes automaticamente
            instance = self.consolidate_batches_by_expiry(instance)
            
            # Buscar lotes ativos ordenados por validade (FIFO)
            active_batches = instance.batches.filter(quantity__gt=0).order_by('expiration_date', 'id')
            
            # Recalcular total real baseado nos lotes
            total_real = active_batches.aggregate(total=Sum('quantity'))['total'] or 0
            
            if instance.total_quantity != total_real:
                print(f"🔄 Corrigindo total de {instance.product.name}: {instance.total_quantity} → {total_real}")
                instance.total_quantity = total_real
                instance.save()
            
            # Serializar com dados básicos
            serializer = self.get_serializer(instance)
            data = serializer.data
            
            # ✅ Substituir lotes por versão ordenada e enriquecida
            batches_data = []
            today = timezone.now().date()
            
            for batch in active_batches:
                try:
                    # Calcular informações de validade
                    is_expired = False
                    days_to_expire = None
                    
                    if batch.expiration_date:
                        is_expired = batch.expiration_date < today
                        if not is_expired:
                            days_to_expire = (batch.expiration_date - today).days
                    
                    batches_data.append({
                        'id': batch.id,
                        'batch_code': batch.batch_code or 'S/N',
                        'expiration_date': batch.expiration_date,
                        'quantity': batch.quantity,
                        'cost_price': float(getattr(batch, 'cost_price', 0)),
                        'formatted_date': batch.expiration_date.strftime('%d/%m/%Y') if batch.expiration_date else 'Sem validade',
                        'is_expired': is_expired,
                        'is_near_expiry': days_to_expire is not None and days_to_expire <= 30,
                        'days_to_expire': days_to_expire,
                        'status': 'expired' if is_expired else ('near_expiry' if days_to_expire is not None and days_to_expire <= 30 else 'valid')
                    })
                    
                except Exception as e:
                    print(f"⚠️ Erro ao processar lote {batch.id}: {e}")
                    continue
            
            # Estatísticas dos lotes
            batch_stats = {
                'total_batches': len(batches_data),
                'expired_batches': len([b for b in batches_data if b['is_expired']]),
                'near_expiry_batches': len([b for b in batches_data if b['is_near_expiry'] and not b['is_expired']]),
                'valid_batches': len([b for b in batches_data if not b['is_expired'] and not b['is_near_expiry']])
            }
            
            # Atualizar response com dados organizados
            data['batches'] = batches_data
            data['batch_stats'] = batch_stats
            data['total_quantity'] = total_real
            
            print(f"✅ Detalhes do item {instance.id} carregados com {len(batches_data)} lotes")
            return Response(data)
            
        except Exception as e:
            print(f"❌ Erro no retrieve do item {kwargs.get('pk')}: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'error': 'Erro ao carregar detalhes do item',
                'message': str(e)
            }, status=500)

    def perform_create(self, serializer):
        """Garantir que criação sempre vincula à loja correta"""
        try:
            store = get_current_store(self.request.user)
            serializer.save(store=store)
            print(f"✅ Item criado para a loja {store.id}")
        except Exception as e:
            print(f"❌ Erro ao criar item: {e}")
            raise

    def perform_update(self, serializer):
        """Recalcular total após atualização"""
        try:
            instance = serializer.save()
            
            # Recalcular total baseado nos lotes
            total_real = instance.batches.filter(quantity__gt=0).aggregate(
                total=Sum('quantity')
            )['total'] or 0
            
            if instance.total_quantity != total_real:
                print(f"🔄 Recalculando total após update: {instance.total_quantity} → {total_real}")
                instance.total_quantity = total_real
                instance.save()
                
        except Exception as e:
            print(f"❌ Erro ao atualizar item: {e}")
            raise

    def update(self, request, *args, **kwargs):
        """Override do update com tratamento de erro"""
        try:
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            
            print(f"🔄 Atualizando item {instance.id}: {request.data}")
            
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            
            if getattr(instance, '_prefetched_objects_cache', None):
                instance._prefetched_objects_cache = {}
            
            return Response(serializer.data)
            
        except Exception as e:
            print(f"❌ Erro no update: {e}")
            return Response({
                'error': 'Erro ao atualizar item',
                'message': str(e)
            }, status=500)

    def destroy(self, request, *args, **kwargs):
        """Override do destroy com logs"""
        try:
            instance = self.get_object()
            print(f"🗑️ Removendo item {instance.id}")
            
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except Exception as e:
            print(f"❌ Erro ao remover item: {e}")
            return Response({
                'error': 'Erro ao remover item',
                'message': str(e)
            }, status=500)


# NOTA: aqui existia uma segunda definição (morta) de StockTransactionViewSet
# ('VERSÃO CORRIGIDA FINAL'). Como Python sobrescreve classes redefinidas, a
# versão que sempre valeu foi a 'VERSÃO COM FIFO FUNCIONAL' (mais abaixo neste
# arquivo). A duplicata foi removida para que o router DRF registre a classe
# certa sem ambiguidade. (Auditoria P2.1)

class StockEntryView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        print(f"\n=== [DEBUG] StockEntryView ===")
        print(f"Usuário: {request.user}")
        print(f"Dados recebidos: {request.data}")
        
        # ✅ 1. Obter store ANTES da validação
        try:
            store = get_current_store(request.user)
            print(f"✅ Store obtida: {store.slug if hasattr(store, 'slug') else store.id}")
        except Exception as e:
            print(f"❌ Erro ao obter store: {e}")
            return Response({
                "error": "Usuário não possui loja vinculada.",
                "details": str(e)
            }, status=403)
        
        # ✅ 2. Validar dados COM store no contexto (automático)
        serializer = StockEntrySerializer(
            data=request.data,
            context={'store': store, 'request': request}
        )
        
        if not serializer.is_valid():
            print(f"❌ Serializer inválido: {serializer.errors}")
            return Response(serializer.errors, status=400)
            
        data = serializer.validated_data
        print(f"✅ Dados validados: {data}")
        
        # ✅ 3. Processar entrada de estoque (lógica existente mantida)
        try:
            with transaction.atomic():
                # Conversão de strings vazias para None
                raw_sku = data.get('natura_sku')
                sku_input = raw_sku if raw_sku and str(raw_sku).strip() != "" else None
                
                raw_barcode = data.get('bar_code')
                barcode_input = raw_barcode if raw_barcode and str(raw_barcode).strip() != "" else None
                
                name_input = data.get('name', '').strip()
                category_input = data.get('category', 'Geral')
                
                if name_input in ["Produto sem nome", "Produto Novo", ""]:
                    name_input = "Produto Novo"
                
                print(f"Buscando produto: SKU={sku_input}, Barcode={barcode_input}")
                
                # 1. Buscar produto no catálogo
                product = None
                
                if barcode_input:
                    product = Product.objects.filter(bar_code=barcode_input).first()
                    
                if not product and sku_input:
                    product = Product.objects.filter(natura_sku=sku_input).first()
                
                print(f"Produto encontrado: {product}")
                
                # 2. Criar ou atualizar produto
                if product:
                    is_protected = getattr(product, 'is_protected', False)
                    if is_protected:
                        print("Produto oficial protegido - apenas vincular")
                    else:
                        print("Produto local não protegido - validando atualizações")
                        updated = False
                        
                        if barcode_input and not product.bar_code:
                            product.bar_code = barcode_input
                            updated = True
                            
                        if sku_input and not product.natura_sku:
                            if not Product.objects.exclude(id=product.id).filter(natura_sku=sku_input).exists():
                                product.natura_sku = sku_input
                                updated = True
                        
                        if name_input != "Produto Novo" and product.name != name_input:
                            product.name = name_input
                            updated = True
                            
                        if data.get('image_url') and not getattr(product, 'image_url', ''):
                            product.image_url = data['image_url']
                            updated = True
                        
                        if updated:
                            product.save()
                            print("Produto atualizado com os novos dados")
                else:
                    print("Criando novo produto local")
                    product = Product.objects.create(
                        bar_code=barcode_input,
                        natura_sku=sku_input,
                        name=name_input,
                        category=category_input,
                        official_price=data.get('sale_price', 0),
                        image_url=data.get('image_url', ''),
                        last_checked_at=timezone.now()
                    )
                    print(f"Produto criado: {product}")
                
                # 3. Gerenciar estoque da loja (TENANT-AWARE)
                print(f"Criando/atualizando InventoryItem para store={store}, product={product}")
                item, created = InventoryItem.objects.get_or_create(
                    store=store,  # ✅ TENANT: isolamento por loja
                    product=product,
                    defaults={
                        'cost_price': data.get('cost_price', 0),
                        'sale_price': data.get('sale_price', 0),
                        'total_quantity': 0
                    }
                )
                print(f"InventoryItem: {item} (criado: {created})")
                
                if data.get('cost_price'): 
                    item.cost_price = data['cost_price']
                if data.get('sale_price'): 
                    item.sale_price = data['sale_price']
                item.save()
                print("InventoryItem salvo")
                
                # 4. Verificar se já existe lote com mesma validade (CONSOLIDAÇÃO)
                expiration_date = data.get('expiration_date')
                existing_batch = None
                
                if expiration_date:
                    existing_batch = item.batches.filter(
                        expiration_date=expiration_date,
                        quantity__gt=0
                    ).first()
                else:
                    # Para produtos sem validade, consolidar em um lote único
                    existing_batch = item.batches.filter(
                        expiration_date__isnull=True,
                        quantity__gt=0
                    ).first()
                
                if existing_batch:
                    # ✅ CONSOLIDAR: Somar quantidade no lote existente
                    print(f"📦 Consolidando com lote existente {existing_batch.id}")
                    existing_batch.quantity += data['quantity']
                    existing_batch.save()
                    used_batch = existing_batch
                else:
                    # Criar novo lote
                    print("Criando InventoryBatch")
                    used_batch = InventoryBatch.objects.create(
                        item=item,
                        quantity=data['quantity'],
                        batch_code=data.get('batch_code', ''),
                        expiration_date=expiration_date
                    )
                    print(f"Batch criado: {used_batch}")
                
                # 5. Atualizar Total Consolidado
                total_real = item.batches.aggregate(total=Sum('quantity'))['total'] or 0
                item.total_quantity = total_real
                item.save()
                print(f"Total atualizado: {total_real}")
                
                # 6. Registrar Transação
                print("Criando StockTransaction")
                StockTransaction.objects.create(
                    store=store,  # ✅ TENANT: transação por loja
                    product=product,
                    batch=used_batch,
                    transaction_type='ENTRADA',
                    quantity=data['quantity'],
                    unit_cost=data.get('cost_price'),
                    unit_price=data.get('sale_price'),
                    description=f"Entrada Lote {used_batch.batch_code or 'S/N'}"
                )
                print("Transação criada")
                
                # 7. Adicionar à sessão se existir (opcional)
                try:
                    from .models import RegistrationSession
                    session = RegistrationSession.objects.filter(store=store, is_active=True).first()
                    if session:
                        session.add_product(item, data['quantity'])
                        print(f"✅ Produto adicionado à sessão {session.id}")
                except Exception as session_error:
                    print(f"⚠️ Erro na sessão (não crítico): {session_error}")
                    # Sessão é opcional, não quebra o fluxo
                    
        except ValidationError as e:
            # ✅ Erros de validação (como limite de plano)
            print(f"❌ Erro de validação: {e.detail}")
            return Response(e.detail, status=400)
        except Exception as e:
            print(f"❌ ERRO na transação: {str(e)}")
            print(f"Tipo do erro: {type(e)}")
            import traceback
            traceback.print_exc()
            return Response({"error": f"Erro interno: {str(e)}"}, status=500)
        
        print("✅ Sucesso!")
        return Response({
            "message": "Estoque atualizado com sucesso!", 
            "product": product.name,
            "new_total": item.total_quantity,
            "batch_consolidated": existing_batch is not None,
            "tenant_info": {
                "store_id": store.id,
                "current_products": store.product_count if hasattr(store, 'product_count') else 'N/A',
                "plan": store.plan
            }
        })
# inventory/views.py - CORRIGIR SaleCheckoutView

class SaleCheckoutView(APIView):
    """
    CAIXA / PDV (SCAN DE SAÍDA) - FIFO CORRIGIDO
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = SaleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
            
        data = serializer.validated_data
        store = get_current_store(request.user)
        total_sale = 0
        
        try:
            with transaction.atomic():
                sale = Sale.objects.create(
                    store=store,
                    client_name=data.get('client_name', ''),
                    payment_method=data.get('payment_method', 'DINHEIRO'),
                    transaction_type=data.get('transaction_type', 'VENDA'),
                    notes=data.get('notes', '')
                )
                
                for item_data in data['items']:
                    product = Product.objects.get(id=item_data['product_id'])
                    inventory_item = InventoryItem.objects.get(store=store, product=product)
                    
                    # ✅ APLICAR FIFO AUTOMÁTICO
                    batches_used = self.apply_fifo_withdrawal(
                        inventory_item, 
                        item_data['quantity']
                    )
                    
                    # Criar item de venda
                    sale_item = SaleItem.objects.create(
                        sale=sale,
                        product=product,
                        quantity=item_data['quantity'],
                        unit_price=item_data['unit_price'],
                        total_price=item_data['quantity'] * item_data['unit_price']
                    )
                    
                    # Registrar transações para cada lote usado
                    for batch_info in batches_used:
                        StockTransaction.objects.create(
                            store=store,
                            product=product,
                            batch_id=batch_info['batch_id'],
                            transaction_type='VENDA',
                            quantity=-batch_info['quantity_used'],
                            unit_cost=inventory_item.cost_price,
                            unit_price=item_data['unit_price'],
                            description=f"Venda FIFO - Lote {batch_info['expiration_date']}",
                            notes=f"Venda #{sale.id}"
                        )
                    
                    total_sale += sale_item.total_price
                
                sale.total_amount = total_sale
                sale.save()
                
                return Response({
                    'message': 'Venda registrada com sucesso',
                    'sale_id': sale.id,
                    'total_amount': total_sale
                })
                
        except Exception as e:
            print(f"❌ Erro na venda: {e}")
            return Response({
                'error': 'Erro ao processar venda',
                'message': str(e)
            }, status=500)
    
    def apply_fifo_withdrawal(self, inventory_item, quantity_to_withdraw):
        """✅ NOVO: Aplica baixa FIFO automática nos lotes"""
        print(f"🎯 Aplicando FIFO: {quantity_to_withdraw} unidades de {inventory_item.product.name}")
        
        # Buscar lotes ordenados por validade (FIFO)
        available_batches = inventory_item.batches.filter(
            quantity__gt=0
        ).order_by('expiration_date', 'id')
        
        if not available_batches.exists():
            raise ValueError("Não há lotes disponíveis")
        
        total_available = sum(batch.quantity for batch in available_batches)
        if total_available < quantity_to_withdraw:
            raise ValueError(f"Estoque insuficiente. Disponível: {total_available}, Solicitado: {quantity_to_withdraw}")
        
        # Aplicar baixas nos lotes (FIFO)
        remaining_to_withdraw = quantity_to_withdraw
        batches_used = []
        
        for batch in available_batches:
            if remaining_to_withdraw <= 0:
                break
            
            qty_from_batch = min(remaining_to_withdraw, batch.quantity)
            
            print(f"📦 Lote {batch.id} (Val: {batch.expiration_date}): {batch.quantity} → {batch.quantity - qty_from_batch}")
            
            # Aplicar baixa
            batch.quantity -= qty_from_batch
            batch.save()
            
            # Se lote zerou, pode ser removido
            if batch.quantity == 0:
                print(f"🗑️ Lote {batch.id} zerado - removendo")
                batch.delete()
            
            batches_used.append({
                'batch_id': batch.id,
                'quantity_used': qty_from_batch,
                'expiration_date': batch.expiration_date
            })
            
            remaining_to_withdraw -= qty_from_batch
        
        # Recalcular total do inventário
        total_real = inventory_item.batches.aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        inventory_item.total_quantity = total_real
        inventory_item.save()
        
        print(f"📊 Total atualizado: {inventory_item.total_quantity}")
        
        return batches_used
# ==========================================
# 3. BUSCA INTELIGENTE (SCRAPER)
# ==========================================

@api_view(['GET'])
@permission_classes([AllowAny])   

def lookup_product(request):
    """
    Busca produto no banco local ou na internet via RPA.
    Suporta busca por EAN exato, SKU exato ou Nome parcial (autocomplete).
    """
    query = request.query_params.get('ean') or request.query_params.get('q')
    force_remote = request.query_params.get('force_remote') == 'true'
    
    print(f"\n🔍 [DEBUG] Nova busca API: '{query}'")

    if not query:
        return Response({"error": "Parâmetro de busca obrigatório"}, status=400)
    
    # --- 1. SE FOR BUSCA POR NOME (NÃO É NÚMERO) ---
    # Isso atende ao ProductSearchModal perfeitamente
    if not query.isdigit():
        print(f"   ↳ Busca Textual detectada. Procurando no Catálogo Global...")
        
        # Faz uma busca case-insensitive no catálogo global (Product)
        candidates = Product.objects.filter(name__icontains=query).order_by('name')[:10]
        
        if candidates.exists():
            print(f"   ✅ Retornando {candidates.count()} candidatos.")
            return Response({
                "found": True,
                "source": "suggestion",
                "google_name": query,
                "candidates": ProductSerializer(candidates, many=True).data,
                "message": "Candidatos encontrados."
            })
        else:
            # Se não achou no banco, pode tentar jogar no Google (opcional) ou só retornar falso
            return Response({"found": False, "message": "Nenhum produto encontrado com este nome na base."})

    # --- 2. SE FOR BUSCA POR EAN / SKU (NÚMERO) ---
    print(f"   ↳ Busca Numérica detectada. Verificando base local...")
    
    if not force_remote:
        local = Product.objects.filter(Q(bar_code=query) | Q(natura_sku=query)).first()
        if local:
            print(f"   ✅ Encontrado no banco local (Match Exato): {local.name}")
            return Response({"found": True, "source": "local", "data": ProductSerializer(local).data})
            
    # Se não achou local ou forçou remoto, vai pros Scrapers (Google/Natura/Cosmos)
    if len(query) > 5:
        print(f"   ↳ Não achou EAN localmente. Iniciando Scraper para {query}...")
        
        online_data = None
        
        if online_data:
            sku_found = online_data.get('natura_sku')
            name_found = online_data.get('name')
            
            # Salvar resultados adicionais (se a busca trouxe vários)
            all_results = online_data.get('all_results', [])
            for p in all_results:
                Product.objects.update_or_create(
                    natura_sku=p['natura_sku'],
                    defaults={'name': p['name'], 'official_price': p.get('sale_price', 0), 'category': p.get('category', 'Geral'), 'last_checked_at': timezone.now()}
                )
            
            # CASO 1: TEM SKU (Google ou Natura achou)
            if sku_found:
                try:
                    product = Product.objects.get(natura_sku=sku_found)
                    product.bar_code = query
                    product.save()
                    print(f"   🧠 APRENDIZADO: Vinculado EAN {query} ao SKU existente {sku_found}")
                except Product.DoesNotExist:
                    product = Product.objects.create(
                        natura_sku=sku_found, bar_code=query, name=name_found,
                        official_price=online_data.get('sale_price', 0), category=online_data.get('category', 'Geral'), description=online_data.get('description', '')
                    )
                    print(f"   🧠 APRENDIZADO: Novo produto criado (SKU {sku_found})")
                
                return Response({"found": True, "source": "remote_learned", "data": ProductSerializer(product).data})
                
            # CASO 2: SÓ TEM NOME (Ex: Cosmos achou)
            elif name_found:
                return Response({
                    "found": True, "source": "remote_partial", "data": online_data,
                    "message": "Produto achado, mas sem código Natura oficial."
                })
                
    return Response({"found": False, "source": None})


# ==========================================
# 4. VITRINE PÚBLICA E DASHBOARD
# ==========================================
# inventory/views.py - CORRIGIR dashboard_overview
@api_view(['GET'])
@permission_classes([AllowAny]) # ✅ Público para clientes
def public_storefront(request, slug):
    """
    Exibe os produtos disponíveis da loja para clientes (Vitrine).
    """
    try:
        store = Store.objects.get(slug=slug)
    except Store.DoesNotExist:
        return Response({"error": "Loja não encontrada"}, status=404)
        
    items = InventoryItem.objects.filter(
        store=store, total_quantity__gt=0
    ).select_related('product').prefetch_related('batches')
    
    items_data = []
    for item in items:
        # Pega a validade do lote que vence primeiro
        first_batch = item.batches.filter(quantity__gt=0).order_by('expiration_date').first()
        
        items_data.append({
            "id": item.id,
            "sale_price": item.sale_price if item.sale_price > 0 else item.product.official_price,
            "total_quantity": item.total_quantity,
            "product": {
                "name": item.product.name,
                "category": item.product.category,
                "image_url": item.product.image_url
            },
            "next_expiration": first_batch.expiration_date if first_batch else None
        })
        
    return Response({
        "store": {
            "name": store.name,
            "whatsapp": store.whatsapp
        },
        "items": items_data
    })

from django.db.models import Sum, Count, F, Q
from django.utils import timezone
from datetime import datetime, timedelta


def _require_pro_feature(store, feature_key):
    """
    Verifica no BACKEND se a loja tem direito a um recurso pago.

    O bloqueio no frontend é só de interface: qualquer pessoa pode chamar a
    API direto (curl, DevTools) e obter os dados. Recurso pago precisa ser
    barrado aqui também.

    Retorna None se pode usar, ou um Response 403 se não pode.
    """
    try:
        permitido = store.can_use_feature.get(feature_key, False)
    except Exception:
        permitido = False

    if not permitido:
        return Response(
            {
                'error': 'Recurso exclusivo do plano PRO',
                'code': 'PRO_REQUIRED',
                'feature': feature_key,
            },
            status=403,
        )
    return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_overview(request):
    """Dashboard principal - VERSÃO CORRIGIDA COM VERIFICAÇÕES DE SEGURANÇA"""
    try:
        store = ensure_user_has_store(request.user)
        if not store:
            return Response({'error': 'Loja não encontrada'}, status=400)

        # 🔒 Recurso pago: valida o plano no servidor, não só na interface.
        bloqueio = _require_pro_feature(store, 'analytics')
        if bloqueio:
            return bloqueio

        # ✅ PERÍODO CONFIGURÁVEL COM VALIDAÇÃO
        period = request.GET.get('period', '30d')
        period_map = {'7d': 7, '30d': 30, '90d': 90, '180d': 180, '1y': 365}
        days = period_map.get(period, 30)
        start_date = timezone.now() - timedelta(days=days)
        today = timezone.now().date()

        print(f"📊 Dashboard período: {period} ({days} dias) - desde {start_date.date()}")

        # 📊 MÉTRICAS DE ESTOQUE COM VERIFICAÇÃO
        try:
            inventory_items = InventoryItem.objects.filter(store=store)
            total_products = inventory_items.count()
            total_stock = sum(item.total_quantity or 0 for item in inventory_items)
            
            # ✅ CORREÇÃO: Verificar se min_quantity existe
            low_stock_items = inventory_items.filter(
                Q(total_quantity__lte=F('min_quantity')) | Q(total_quantity=0)
            )
            low_stock_count = low_stock_items.count()
        except Exception as e:
            print(f"⚠️ Erro nas métricas de estoque: {e}")
            total_products = 0
            total_stock = 0
            low_stock_count = 0

        # 💰 VALORES FINANCEIROS COM VERIFICAÇÃO
        total_invested = 0
        total_potential = 0
        try:
            for item in inventory_items:
                if item.total_quantity and item.cost_price:
                    total_invested += item.total_quantity * item.cost_price
                if item.total_quantity and item.sale_price:
                    total_potential += item.total_quantity * item.sale_price
        except Exception as e:
            print(f"⚠️ Erro nos valores financeiros: {e}")

        # 💸 RECEITAS E VENDAS COM VERIFICAÇÃO
        try:
            revenue_transactions = StockTransaction.objects.filter(
                store=store,
                transaction_type='VENDA',
                created_at__gte=start_date
            )

            # ✅ CORREÇÃO: Verificar se existem transações
            if revenue_transactions.exists():
                total_revenue = revenue_transactions.aggregate(
                    total=Sum('unit_price')
                )['total'] or 0
                
                total_sales = revenue_transactions.count()
                
                # ✅ CORREÇÃO: Evitar erro de agregação
                quantity_sum = 0
                for trans in revenue_transactions:
                    quantity_sum += abs(trans.quantity or 0)
                total_items_sold = quantity_sum
            else:
                total_revenue = 0
                total_sales = 0
                total_items_sold = 0
        except Exception as e:
            print(f"⚠️ Erro nas receitas: {e}")
            total_revenue = 0
            total_sales = 0
            total_items_sold = 0

        # 📈 VENDAS POR SEMANA COM VERIFICAÇÃO
        weekly_sales = []
        try:
            weeks_back = 4
            for i in range(weeks_back):
                week_start = timezone.now() - timedelta(weeks=i+1)
                week_end = timezone.now() - timedelta(weeks=i)
                
                week_transactions = StockTransaction.objects.filter(
                    store=store,
                    transaction_type='VENDA',
                    created_at__range=[week_start, week_end]
                )
                
                # ✅ CÁLCULO MANUAL PARA EVITAR ERROS DE AGREGAÇÃO
                revenue = 0
                quantity = 0
                cost = 0
                
                for trans in week_transactions:
                    revenue += trans.unit_price or 0
                    quantity += abs(trans.quantity or 0)
                    cost += abs((trans.quantity or 0) * (trans.unit_cost or 0))
                
                profit = revenue - cost
                
                weekly_sales.append({
                    'week': f'S{weeks_back - i}',
                    'week_label': f'Semana {weeks_back - i}',
                    'revenue': float(revenue),
                    'quantity': int(quantity),
                    'profit': float(profit),
                    'cost': float(cost)
                })
            
            weekly_sales.reverse()  # Ordem cronológica
        except Exception as e:
            print(f"⚠️ Erro nas vendas semanais: {e}")
            weekly_sales = []

        # 📊 VENDAS POR MÊS COM VERIFICAÇÃO
        monthly_comparison = []
        try:
            for i in range(3):
                month_start = (timezone.now().replace(day=1) - timedelta(days=30*i))
                month_end = month_start + timedelta(days=30)
                
                month_transactions = StockTransaction.objects.filter(
                    store=store,
                    transaction_type='VENDA',
                    created_at__range=[month_start, month_end]
                )
                
                # ✅ CÁLCULO MANUAL
                revenue = 0
                cost = 0
                quantity = 0
                
                for trans in month_transactions:
                    revenue += trans.unit_price or 0
                    cost += abs((trans.quantity or 0) * (trans.unit_cost or 0))
                    quantity += abs(trans.quantity or 0)
                
                profit = revenue - cost
                
                monthly_comparison.append({
                    'month': month_start.strftime('%b/%Y'),
                    'month_short': month_start.strftime('%b'),
                    'revenue': float(revenue),
                    'profit': float(profit),
                    'cost': float(cost),
                    'quantity': int(quantity)
                })

            monthly_comparison.reverse()
        except Exception as e:
            print(f"⚠️ Erro nas vendas mensais: {e}")
            monthly_comparison = []

        # 📈 VENDAS DIÁRIAS COM VERIFICAÇÃO
        daily_sales = []
        try:
            for i in range(7):
                day = timezone.now() - timedelta(days=6-i)
                
                day_transactions = StockTransaction.objects.filter(
                    store=store,
                    transaction_type='VENDA',
                    created_at__date=day.date()
                )
                
                # ✅ CÁLCULO MANUAL
                revenue = 0
                quantity = 0
                cost = 0
                
                for trans in day_transactions:
                    revenue += trans.unit_price or 0
                    quantity += abs(trans.quantity or 0)
                    cost += abs((trans.quantity or 0) * (trans.unit_cost or 0))
                
                daily_sales.append({
                    'date': day.strftime('%Y-%m-%d'),
                    'day_name': day.strftime('%a'),
                    'day_full': day.strftime('%d/%m'),
                    'revenue': float(revenue),
                    'quantity': int(quantity),
                    'profit': float(revenue - cost),
                    'cost': float(cost)
                })
        except Exception as e:
            print(f"⚠️ Erro nas vendas diárias: {e}")
            daily_sales = []

        # 🏆 TOP PRODUTOS COM VERIFICAÇÃO
        top_products = []
        try:
            # ✅ CÁLCULO MANUAL PARA EVITAR ERROS
            product_stats = {}
            
            for trans in StockTransaction.objects.filter(
                store=store,
                transaction_type='VENDA',
                created_at__gte=start_date
            ).select_related('product'):
                
                if not trans.product:
                    continue
                    
                product_id = trans.product.id
                product_name = trans.product.name
                
                if product_id not in product_stats:
                    product_stats[product_id] = {
                        'name': product_name,
                        'id': product_id,
                        'total_sold': 0,
                        'total_revenue': 0,
                        'total_cost': 0
                    }
                
                product_stats[product_id]['total_sold'] += abs(trans.quantity or 0)
                product_stats[product_id]['total_revenue'] += trans.unit_price or 0
                product_stats[product_id]['total_cost'] += abs((trans.quantity or 0) * (trans.unit_cost or 0))
            
            # Converter para lista e ordenar
            top_products = sorted(
                product_stats.values(),
                key=lambda x: x['total_revenue'],
                reverse=True
            )[:10]
            
            # Adicionar lucro
            for product in top_products:
                product['profit'] = product['total_revenue'] - product['total_cost']
                
        except Exception as e:
            print(f"⚠️ Erro nos top produtos: {e}")
            top_products = []

        # 📊 ANÁLISE POR CATEGORIA COM VERIFICAÇÃO
        category_stats = []
        try:
            categories = InventoryItem.objects.filter(
                store=store,
                total_quantity__gt=0
            ).values_list('product__category', flat=True).distinct()

            category_total_value = 0
            for category in categories:
                if not category:
                    category = 'Sem categoria'
                    
                items = InventoryItem.objects.filter(
                    store=store,
                    product__category=category,
                    total_quantity__gt=0
                )
                
                total_products_cat = items.count()
                total_quantity_cat = sum(item.total_quantity or 0 for item in items)
                total_value = sum(
                    (item.total_quantity or 0) * (item.sale_price or 0)
                    for item in items
                )
                category_total_value += total_value
                
                category_stats.append({
                    'category': category,
                    'total_products': total_products_cat,
                    'total_quantity': total_quantity_cat,
                    'total_value': total_value
                })

            # Calcular percentuais
            for cat in category_stats:
                cat['percentage'] = (cat['total_value'] / max(category_total_value, 1)) * 100

            category_stats.sort(key=lambda x: x['total_value'], reverse=True)
        except Exception as e:
            print(f"⚠️ Erro na análise por categoria: {e}")
            category_stats = []

        # ⚠️ ALERTAS COM VERIFICAÇÃO
        low_stock_alerts = []
        expiring_soon = []
        
        try:
            low_stock_alerts = [
                {
                    'id': item.id,
                    'product_name': item.product.name if item.product else 'Produto sem nome',
                    'current_stock': item.total_quantity or 0,
                    'min_stock': item.min_quantity or 0,
                    'status': 'critical' if (item.total_quantity or 0) == 0 else 'warning'
                }
                for item in InventoryItem.objects.filter(
                    Q(total_quantity__lte=F('min_quantity')) | Q(total_quantity=0),
                    store=store
                ).select_related('product')[:10]
            ]
        except Exception as e:
            print(f"⚠️ Erro nos alertas de estoque baixo: {e}")

        try:
            thirty_days_from_now = today + timedelta(days=30)
            expiring_batches = InventoryBatch.objects.filter(
                item__store=store,
                expiration_date__lte=thirty_days_from_now,
                expiration_date__gte=today,
                quantity__gt=0
            ).select_related('item__product').order_by('expiration_date')[:10]
            
            expiring_soon = [
                {
                    'id': batch.id,
                    'product_name': batch.item.product.name if batch.item and batch.item.product else 'Produto sem nome',
                    'batch_code': batch.batch_code or 'S/N',
                    'expiration_date': batch.expiration_date,
                    'quantity': batch.quantity,
                    'days_to_expire': (batch.expiration_date - today).days
                }
                for batch in expiring_batches
            ]
        except Exception as e:
            print(f"⚠️ Erro nos alertas de vencimento: {e}")

        # 💡 MÉTRICAS DE PERFORMANCE COM VERIFICAÇÃO
        profit_potential = total_potential - total_invested
        avg_ticket = total_revenue / max(total_sales, 1)
        
        turnover_rate = total_items_sold / max(total_stock, 1) if total_stock > 0 else 0
        stock_rotation_days = 30 / max(turnover_rate, 0.1) if turnover_rate > 0 else 0
        sell_through_rate = (total_items_sold / max(total_stock, 1)) * 100 if total_stock > 0 else 0

        # Margem de lucro real
        total_cost_sold = sum(
            abs((trans.quantity or 0) * (trans.unit_cost or 0))
            for trans in revenue_transactions
        ) if 'revenue_transactions' in locals() else 0
        
        real_profit = total_revenue - total_cost_sold
        real_margin = (real_profit / max(total_revenue, 1)) * 100

        # ✅ FLUXO DE CAIXA
        cash_flow_summary = {
            'total_income': float(total_revenue),
            'total_expenses': float(total_cost_sold),
            'net_flow': float(real_profit),
            'daily_average': float(total_revenue / max(days, 1)),
            'margin_percent': float(real_margin),
            'growth_rate': 0.0
        }

        return Response({
            'period_info': {
                'selected': period,
                'days': days,
                'start_date': start_date.date(),
                'end_date': today
            },
            'store_info': {
                'name': store.name,
                'plan': getattr(store, 'plan', 'free'),
                'created_at': store.created_at
            },
            'financial': {
                'total_invested': float(total_invested),
                'total_potential': float(total_potential),
                'profit_potential': float(profit_potential),
                'total_revenue_30d': float(total_revenue),
                'avg_ticket': float(avg_ticket),
                'margin_percent': float(real_margin),
                'real_profit': float(real_profit),
                'cost_of_goods_sold': float(total_cost_sold)
            },
            'inventory': {
                'total_products': total_products,
                'total_stock': total_stock,
                'low_stock_count': low_stock_count
            },
            'sales': {
                'total_sales_30d': total_sales,
                'total_items_sold_30d': total_items_sold,
                'daily_sales': daily_sales,
                'weekly_sales': weekly_sales,
                'monthly_comparison': monthly_comparison
            },
            'charts': {
                'by_category': category_stats[:5],
                'top_products': [
                    {
                        'name': item['name'],
                        'id': item['id'],
                        'total_sold': int(item['total_sold']),
                        'revenue': float(item['total_revenue']),
                        'profit': float(item['profit'])
                    }
                    for item in top_products
                ],
                'performance_metrics': {
                    'turnover_rate': round(turnover_rate, 2),
                    'stock_rotation_days': round(stock_rotation_days),
                    'sell_through_rate': round(sell_through_rate, 1)
                }
            },
            'alerts': {
                'low_stock': low_stock_alerts,
                'expiring_soon': expiring_soon
            },
            'cash_flow': cash_flow_summary
        })

    except Exception as e:
        print(f"❌ Erro crítico no dashboard: {e}")
        import traceback
        traceback.print_exc()
        
        # ✅ RETORNO DE FALLBACK PARA EVITAR CRASH
        return Response({
            'period_info': {
                'selected': '30d',
                'days': 30,
                'start_date': (timezone.now() - timedelta(days=30)).date(),
                'end_date': timezone.now().date()
            },
            'store_info': {
                'name': 'Loja',
                'plan': 'free',
                'created_at': timezone.now()
            },
            'financial': {
                'total_invested': 0.0,
                'total_potential': 0.0,
                'profit_potential': 0.0,
                'total_revenue_30d': 0.0,
                'avg_ticket': 0.0,
                'margin_percent': 0.0,
                'real_profit': 0.0,
                'cost_of_goods_sold': 0.0
            },
            'inventory': {
                'total_products': 0,
                'total_stock': 0,
                'low_stock_count': 0
            },
            'sales': {
                'total_sales_30d': 0,
                'total_items_sold_30d': 0,
                'daily_sales': [],
                'weekly_sales': [],
                'monthly_comparison': []
            },
            'charts': {
                'by_category': [],
                'top_products': [],
                'performance_metrics': {
                    'turnover_rate': 0.0,
                    'stock_rotation_days': 0,
                    'sell_through_rate': 0.0
                }
            },
            'alerts': {
                'low_stock': [],
                'expiring_soon': []
            },
            'cash_flow': {
                'total_income': 0.0,
                'total_expenses': 0.0,
                'net_flow': 0.0,
                'daily_average': 0.0,
                'margin_percent': 0.0,
                'growth_rate': 0.0
            }
        })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_financial_summary(request):
    """Resumo financeiro detalhado"""
    try:
        store = ensure_user_has_store(request.user)
        if not store:
            return Response({'error': 'Loja não encontrada'}, status=400)

        # Período configurável (padrão: últimos 30 dias)
        days = int(request.GET.get('days', 30))
        start_date = timezone.now() - timedelta(days=days)
        
        # 💰 RECEITAS POR TIPO DE TRANSAÇÃO
        revenue_by_type = StockTransaction.objects.filter(
            store=store,
            created_at__gte=start_date,
            transaction_type__in=['VENDA', 'PRESENTE', 'BRINDE']
        ).values('transaction_type').annotate(
            total_revenue=Sum('unit_price'),
            total_quantity=Sum('quantity')
        ).order_by('-total_revenue')
        
        # 📊 CUSTOS vs RECEITAS
        cost_analysis = StockTransaction.objects.filter(
            store=store,
            transaction_type='VENDA',
            created_at__gte=start_date
        ).aggregate(
            total_revenue=Sum('unit_price'),
            total_cost=Sum('unit_cost'),
            total_items=Count('id')
        )
        
        profit = (cost_analysis['total_revenue'] or 0) - (cost_analysis['total_cost'] or 0)
        margin = (profit / max(cost_analysis['total_revenue'] or 1, 1)) * 100
        
        return Response({
            'period': {
                'days': days,
                'start_date': start_date.date(),
                'end_date': timezone.now().date()
            },
            'revenue_by_type': [
                {
                    'type': item['transaction_type'],
                    'revenue': float(item['total_revenue'] or 0),
                    'quantity': abs(item['total_quantity'] or 0)
                }
                for item in revenue_by_type
            ],
            'profitability': {
                'total_revenue': float(cost_analysis['total_revenue'] or 0),
                'total_cost': float(cost_analysis['total_cost'] or 0),
                'profit': float(profit),
                'margin_percent': float(margin),
                'total_transactions': cost_analysis['total_items'] or 0
            }
        })
        
    except Exception as e:
        print(f"❌ Erro no resumo financeiro: {e}")
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_inventory_analysis(request):
    """Análise detalhada do inventário"""
    try:
        store = ensure_user_has_store(request.user)
        if not store:
            return Response({'error': 'Loja não encontrada'}, status=400)

        # 📦 ANÁLISE POR CATEGORIA - CORRIGIDO (sem F() expressions problemáticas)
        category_analysis = []
        categories = InventoryItem.objects.filter(
            store=store
        ).values_list('product__category', flat=True).distinct()
        
        for category in categories:
            items = InventoryItem.objects.filter(
                store=store,
                product__category=category
            )
            
            total_products = items.count()
            total_quantity = sum(item.total_quantity or 0 for item in items)
            
            # Calcular valor total manualmente
            total_value = sum(
                (item.total_quantity or 0) * (item.cost_price or 0) 
                for item in items
            )
            
            category_analysis.append({
                'category': category or 'Sem categoria',
                'total_products': total_products,
                'total_quantity': total_quantity,
                'total_value': total_value
            })
        
        # Ordenar por valor
        category_analysis.sort(key=lambda x: x['total_value'], reverse=True)
        
        # 🔄 GIRO DE ESTOQUE (últimos 30 dias)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        turnover_analysis = []
        
        for item in InventoryItem.objects.filter(store=store).select_related('product')[:20]:
            sold_quantity = StockTransaction.objects.filter(
                store=store,
                product=item.product,
                transaction_type='VENDA',
                created_at__gte=thirty_days_ago
            ).aggregate(sold=Sum('quantity'))['sold'] or 0
            
            avg_stock = item.total_quantity or 1
            turnover_rate = abs(sold_quantity) / max(avg_stock, 1) if avg_stock > 0 else 0
            
            turnover_analysis.append({
                'product_name': item.product.name,
                'current_stock': item.total_quantity,
                'sold_30d': abs(sold_quantity),
                'turnover_rate': round(turnover_rate, 2),
                'status': 'high' if turnover_rate > 1 else 'medium' if turnover_rate > 0.5 else 'low'
            })
        
        # Ordenar por taxa de giro
        turnover_analysis.sort(key=lambda x: x['turnover_rate'], reverse=True)
        
        return Response({
            'category_analysis': category_analysis,
            'turnover_analysis': turnover_analysis[:10]  # Top 10
        })
        
    except Exception as e:
        print(f"❌ Erro na análise de inventário: {e}")
        return Response({'error': str(e)}, status=500)
    

# inventory/views.py

@api_view(["GET"])
@permission_classes([IsAuthenticated])  # ✅ Usa autenticação JWT padrão
def feature_gates_view(request):
    """
    Fornece lista de feature gates para o frontend.
    ✅ Autenticação via JWT (não requer API Key de gateway)
    """
    # Opcional: filtrar gates baseado no plano do usuário
    # ⚠️ CORREÇÃO: usava `store.plan == 'pro'` direto, que ignora o trial —
    # `plan` continua 'free' durante o período de teste, só `has_pro_access`
    # (ou `plan_config`) sabem que o trial também dá acesso completo. Com o
    # bug, toda funcionalidade PRO (scanner, gráficos, IA, vitrine, chat,
    # produtos ilimitados) aparecia BLOQUEADA durante os 14 dias de teste —
    # o oposto do que o trial promete. Esta view alimenta useFeatureGates,
    # usado em Dashboard, Index, AddProduct e WithdrawProduct.
    store = get_current_store(request.user)
    is_pro = bool(store and store.has_pro_access)
    
    gates = [
        {"feature_key": "barcode_scanner", "label": "Scanner de Código", "description": None, "requires_pro": True},
        {"feature_key": "ocr_expiry", "label": "Leitor de Validade (IA)", "description": None, "requires_pro": True},
        {"feature_key": "dashboard_charts", "label": "Gráficos Avançados", "description": None, "requires_pro": True},
        {"feature_key": "dashboard_kpi_advanced", "label": "Lucro e Rentabilidade", "description": None, "requires_pro": True},
        {"feature_key": "ai_insights", "label": "Insights com Inteligência Artificial", "description": None, "requires_pro": True},
        {"feature_key": "storefront", "label": "Vitrine Digital", "description": None, "requires_pro": True},
        {"feature_key": "chat_assistant", "label": "Assistente de Estoque", "description": None, "requires_pro": True},
        {"feature_key": "unlimited_products", "label": "Produtos Ilimitados", "description": None, "requires_pro": True},
    ]
    
    # Filtra gates baseado no plano (opcional)
    visible_gates = [g for g in gates if not g['requires_pro'] or is_pro]
    
    return Response(visible_gates)


# backend/core/inventory/views.py

import logging
from django.conf import settings
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

logger = logging.getLogger(__name__)



@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """
    Retorna ou atualiza as informações da loja do usuário.
    
    ✅ OTIMIZAÇÕES:
    - Cache Django para evitar queries repetidas
    - Serialização imediata para evitar ContentNotRenderedError
    - Tratamento de erro seguro que sempre retorna Response DRF
    - Validação de tenant para segurança
    """
    user = request.user
    cache_key = f"profile_{user.id}"
    
    try:
        # ✅ GET: Tentar cache primeiro (5 minutos)
        if request.method == "GET":
            cached = cache.get(cache_key)
            if cached:
                logger.info(f"✅ Profile cache hit for user {user.id}")
                return Response(cached, status=status.HTTP_200_OK)
            
            # ✅ Obter ou criar loja do usuário
            from .utils import get_current_store, validate_store_ownership
            
            # ✅ Query otimizada com select_related para evitar N+1
            store = get_current_store(user)
            
            if not store:
                return Response(
                    {"error": "Loja não encontrada para este usuário"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # ✅ Validar ownership (segurança tenant)
            validate_store_ownership(user, store)
            
            # ✅ Serializar dados
            from .serializers import ProfileSerializer
            serializer = ProfileSerializer(store, context={"request": request})
            
            # ✅ CRÍTICO: Acessar .data força serialização IMEDIATA
            # Isso evita que middleware acesse .content antes do render
            serialized_data = serializer.data
            
            # ✅ Salvar no cache (5 minutos)
            cache.set(cache_key, serialized_data, 300)
            logger.info(f"✅ Profile cached for user {user.id}")
            
            # ✅ Retorna Response com dados já serializados (dict puro)
            return Response(serialized_data, status=status.HTTP_200_OK)
        
        # ✅ PATCH: Atualizar perfil
        elif request.method == "PATCH":
            from .utils import get_current_store, validate_store_ownership
            from .serializers import ProfileSerializer
            
            store = get_current_store(user)
            if not store:
                return Response(
                    {"error": "Loja não encontrada"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            validate_store_ownership(user, store)
            
            serializer = ProfileSerializer(
                store, 
                data=request.data, 
                partial=True,
                context={"request": request}
            )
            
            if serializer.is_valid():
                instance = serializer.save()
                
                # ✅ Forçar serialização imediata
                serialized_data = ProfileSerializer(
                    instance, 
                    context={"request": request}
                ).data
                
                # ✅ Invalidar cache após atualização
                cache.delete(cache_key)
                logger.info(f"✅ Profile updated and cache invalidated for user {user.id}")
                
                return Response(serialized_data, status=status.HTTP_200_OK)
            
            # ✅ Retorna erros de validação como Response válido
            return Response(
                {"errors": serializer.errors}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
    except Exception as e:
        # ✅ Traceback COMPLETO no log do servidor, inclusive em produção.
        # Antes, com DEBUG=False, só era registrado "Erro no profile_view para
        # user X" — sem stack trace —, o que tornava impossível diagnosticar
        # o 500 pelos logs do Render. O traceback fica só no servidor; a
        # resposta ao cliente continua sem detalhes internos.
        user_id = user.id if user.is_authenticated else 'anon'
        logger.error(
            f"❌ Erro no profile_view para user {user_id}: {type(e).__name__}: {e}",
            exc_info=True,
        )

        # ✅ Sempre retorna Response DRF, nunca raise
        return Response(
            {
                "error": "Erro interno ao processar perfil",
                "details": str(e) if settings.DEBUG else "Tente novamente"
            }, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    # ✅ FIM DA FUNÇÃO - Apenas UM bloco except Exception
# ==========================================
# 5. PAINEL ADMIN (Gestão de Assinaturas)
# ==========================================

# Atualizar seu admin panel para usar Store diretamente

def get_admin_stores():
    """Retorna dados para admin panel (baseado em Store)"""
    stores = []
    
    for store in Store.objects.select_related('owner').prefetch_related('items'):
        owner = store.owner
        
        stores.append({
            'id': store.id,
            'store_name': store.name,
            'store_slug': store.slug,
            'owner_email': owner.email if owner else 'Sem dono',
            'owner_name': owner.name if owner else 'Sem nome',
            'plan': store.plan,
            'product_count': store.product_count,
            'storefront_enabled': store.storefront_enabled,
            'whatsapp': store.whatsapp,
            'created_at': store.created_at,
            'last_updated': store.updated_at,
            'payment_provider': store.payment_provider,
            'payment_external_id': store.payment_external_id,
            'subscription_started_at': store.subscription_started_at,
            'subscription_expires_at': store.subscription_expires_at,
            'subscription_status': store.subscription_status,
            'days_until_expiry': store.days_until_expiry,
            'can_add_products': store.can_add_products,
            'features': store.can_use_feature
        })
    
    return stores

# API endpoint para admin
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_stores_list(request):
    """Lista lojas para admin panel"""
    if not request.user.is_staff:
        return Response({'error': 'Sem permissão'}, status=403)
    
    stores = get_admin_stores()
    return Response(stores)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_update_store_plan(request, store_id):
    """Atualiza plano de uma loja"""
    if not request.user.is_staff:
        return Response({'error': 'Sem permissão'}, status=403)
    
    try:
        store = Store.objects.get(id=store_id)
        new_plan = request.data.get('plan')
        
        if new_plan == 'pro':
            store.upgrade_to_pro()
        else:
            store.downgrade_to_free()
        
        return Response({'success': True, 'new_plan': store.plan})
    
    except Store.DoesNotExist:
        return Response({'error': 'Loja não encontrada'}, status=404)
# inventory/views.py - ADICIONAR
# inventory/views.py - CORRIGIR SessionControlView

class SessionControlView(APIView):
    """Controle de Sessão de Registro - VERSÃO CORRIGIDA"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Verificar status da sessão atual"""
        try:
            # ✅ GARANTIR que usuário tenha loja
            store = ensure_user_has_store(request.user)
            
            if not store:
                return Response({
                    'error': 'Não foi possível obter loja para o usuário'
                }, status=400)
            
            print(f"🔍 Verificando sessão para store {store.id}")
            
            # Buscar sessão ativa
            session = RegistrationSession.objects.filter(
                store=store,
                is_active=True
            ).first()
            
            if session:
                return Response({
                    'has_session': True,
                    'session_id': session.id,
                    'started_at': session.started_at,
                    'products_count': session.products_count,
                    'total_estimated_cost': session.total_estimated_cost
                })
            else:
                return Response({
                    'has_session': False
                })
                
        except Exception as e:
            print(f"❌ Erro ao verificar sessão: {e}")
            return Response({
                'error': 'Erro interno do servidor',
                'message': str(e)
            }, status=500)
    
    def post(self, request):
        """Iniciar ou finalizar sessão"""
        try:
            # ✅ GARANTIR que usuário tenha loja
            store = ensure_user_has_store(request.user)
            
            if not store:
                return Response({
                    'error': 'Não foi possível obter loja para o usuário'
                }, status=400)
            
            action = request.data.get('action')
            print(f"🎬 Ação da sessão: {action} para store {store.id}")
            
            if action == 'start':
                # Finalizar sessão anterior se existir
                RegistrationSession.objects.filter(
                    store=store,
                    is_active=True
                ).update(is_active=False)
                
                # ✅ CRIAR nova sessão COM store definido
                session = RegistrationSession.objects.create(
                    store=store  # ✅ GARANTIR que store seja definido
                )
                
                print(f"✅ Sessão {session.id} iniciada para store {store.id}")
                
                return Response({
                    'message': 'Sessão iniciada',
                    'session_id': session.id
                })
                
            elif action == 'finish':
                session = RegistrationSession.objects.filter(
                    store=store,
                    is_active=True
                ).first()
                
                if not session:
                    return Response({
                        'error': 'Nenhuma sessão ativa encontrada'
                    }, status=404)
                
                # Finalizar sessão
                session.is_active = False
                session.finished_at = timezone.now()
                session.save()
                
                return Response({
                    'message': 'Sessão finalizada',
                    'summary': {
                        'products_count': session.products_count,
                        'total_estimated_cost': session.total_estimated_cost,
                        'duration_minutes': session.duration_minutes
                    }
                })
            
            else:
                return Response({
                    'error': 'Ação inválida. Use "start" ou "finish"'
                }, status=400)
                
        except Exception as e:
            print(f"❌ Erro no controle de sessão: {e}")
            import traceback
            traceback.print_exc()
            
            return Response({
                'error': 'Erro interno do servidor',
                'message': str(e)
            }, status=500)
class SessionSummaryView(APIView):
    """Confirma investimento da sessão"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        session_id = request.data.get('session_id')
        
        try:
            session = RegistrationSession.objects.get(id=session_id)
            
            # Salva dados financeiros
            session.payment_method = request.data.get('payment_method')
            session.total_paid = request.data.get('total_paid')
            session.installments = request.data.get('installments', 1)
            session.save()
            
            return Response({
                'message': 'Investimento registrado!',
                'total_paid': session.total_paid
            })
            
        except RegistrationSession.DoesNotExist:
            return Response({'error': 'Sessão não encontrada'}, status=404)
        
# inventory/views.py - ADICIONE esta nova view


from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
# inventory/views.py - SUBSTITUA a função existente por esta versão completa

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import Store, InventoryItem
from django.shortcuts import get_object_or_404

@api_view(['GET'])
@permission_classes([AllowAny])
def public_storefront_view(request, slug=None, brand=None):
    """
    Endpoint público para vitrine - não requer autenticação
    Suporta filtro por marca: /vitrine/{slug}/marca/{brand}
    """
    try:
        # ✅ CORREÇÃO: Validar e buscar a loja de forma mais segura
        if slug:
            store = get_object_or_404(Store, slug=slug)
        else:
            store_id = request.GET.get('seller')
            if not store_id:
                return Response({'error': 'Slug ou seller ID obrigatório'}, status=400)
            store = get_object_or_404(Store, id=store_id)
        
        # ✅ Filtro por marca
        brand_filter = brand or request.GET.get('brand')
        
        # ✅ Base query com relacionamentos corretos
        items_query = InventoryItem.objects.filter(
            store=store,
            total_quantity__gt=0
        ).select_related('product')
        
        # ✅ Aplicar filtro por marca se especificado
        if brand_filter:
            brand_filter = brand_filter.strip()
            items_query = items_query.filter(
                product__brand__icontains=brand_filter
            )
        
        items = items_query.order_by('product__brand', 'product__category', 'product__name')
        
        # ✅ CORREÇÃO: Coletar marcas disponíveis de forma mais segura
        available_brands_query = InventoryItem.objects.filter(
            store=store,
            total_quantity__gt=0,
            product__brand__isnull=False
        ).exclude(
            product__brand__exact=''
        ).values_list('product__brand', flat=True).distinct()
        
        available_brands = sorted(set(available_brands_query))
        
        # ✅ CORREÇÃO: Mapear dados com verificações de segurança
        items_data = []
        for item in items:
            try:
                # Verificações de segurança
                if not item.product:
                    continue
                    
                product_name = item.product.name or "Produto sem nome"
                image_url = getattr(item.product, 'image_url', None)
                
                # ✅ CORREÇÃO: Tratamento seguro de preços
                sale_price = 0
                if item.sale_price:
                    sale_price = float(item.sale_price)
                elif hasattr(item.product, 'official_price') and item.product.official_price:
                    sale_price = float(item.product.official_price)
                
                # ✅ CORREÇÃO: Verificação segura da marca
                brand_name = getattr(item.product, 'brand', None)
                category = getattr(item.product, 'category', 'Geral')
                
                # Estratégia de urgência
                stock_info = {
                    'quantity': item.total_quantity,
                    'is_urgent': item.total_quantity <= 3,
                    'display_text': 'Em estoque' if item.total_quantity > 3 else f'Restam apenas {item.total_quantity}!'
                }
                
                items_data.append({
                    'id': str(item.id),
                    'product_name': product_name,
                    'display_name': product_name,
                    'category': category,
                    'brand': brand_name,
                    'sale_price': sale_price,
                    'total_quantity': item.total_quantity,
                    'stock_info': stock_info,
                    'image_url': image_url,
                })
                
            except Exception as item_error:
                print(f"❌ Erro ao processar item {item.id}: {item_error}")
                continue
        
        # ✅ CORREÇÃO: Dados da loja com verificações seguras
        store_data = {
            'name': getattr(store, 'name', 'Consultora'),
            'whatsapp': getattr(store, 'whatsapp', ''),
            'slug': getattr(store, 'slug', slug or ''),
            # ⚠️ Sem isto, o frontend (Storefront.tsx) nunca sabe a quem
            # atribuir o lead: `tenantId = res.store.user_id`. Com tenantId
            # vazio, `handleSendOrder` pula direto para o WhatsApp e o modal
            # de captura (CRM invisível) nunca abre — era a causa raiz de o
            # CRM nunca disparar, mesmo com o resto pronto.
            'user_id': str(store.owner_id) if store.owner_id else None,
            'tenant_id': str(store.owner_id) if store.owner_id else None,
        }
        
        # Response final
        response_data = {
            'store': store_data,
            'items': items_data,
            'brands': {
                'available': available_brands,
                'current_filter': brand_filter,
                'total_brands': len(available_brands),
                'total_products': len(items_data)
            },
            'meta': {
                'total_items': len(items_data),
                'urgent_items': len([item for item in items_data if item['stock_info']['is_urgent']]),
                'brands_count': len(available_brands)
            }
        }
        
        return Response(response_data)
        
    except Exception as e:
        print(f"❌ Erro no endpoint público: {e}")
        import traceback
        traceback.print_exc()
        return Response({'error': 'Erro interno do servidor'}, status=500)
    
# inventory/views.py - SUBSTITUIR COMPLETAMENTE o StockTransactionViewSet

# inventory/views.py - SUBSTITUIR COMPLETAMENTE o StockTransactionViewSet

class StockTransactionViewSet(TenantModelMixin, viewsets.ModelViewSet):
    """Extrato de Movimentações da Loja - VERSÃO COM FIFO FUNCIONAL"""
    serializer_class = StockTransactionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['transaction_type']
    # ✅ Mesmo motivo do InventoryViewSet: o frontend espera array puro.
    pagination_class = None
    
    def get_queryset(self):
        """Queryset com tratamento de erro robusto"""
        try:
            store = ensure_user_has_store(self.request.user)
            return StockTransaction.objects.filter(
                store=store
            ).select_related('product', 'batch').order_by('-created_at')
        except Exception as e:
            print(f"❌ Erro no get_queryset: {e}")
            return StockTransaction.objects.none()

    def apply_fifo_withdrawal(self, inventory_item, quantity_to_withdraw):
        """✅ FIFO automático com correções - VERSÃO FUNCIONAL"""
        print(f"🎯 Aplicando FIFO: {quantity_to_withdraw} unidades de {inventory_item.product.name}")
        
        # Buscar lotes ordenados por validade (FIFO)
        available_batches = inventory_item.batches.filter(
            quantity__gt=0
        ).order_by('expiration_date', 'id')
        
        if not available_batches.exists():
            raise ValueError("Não há lotes disponíveis")
        
        total_available = sum(batch.quantity for batch in available_batches)
        if total_available < quantity_to_withdraw:
            raise ValueError(f"Estoque insuficiente. Disponível: {total_available}, Solicitado: {quantity_to_withdraw}")
        
        # Aplicar baixas nos lotes (FIFO)
        remaining_to_withdraw = quantity_to_withdraw
        batches_used = []
        
        for batch in available_batches:
            if remaining_to_withdraw <= 0:
                break
            
            qty_from_batch = min(remaining_to_withdraw, batch.quantity)
            
            print(f"📦 Lote {batch.id} (Val: {batch.expiration_date}): {batch.quantity} → {batch.quantity - qty_from_batch}")
            
            # ✅ APLICAR BAIXA NO LOTE
            batch.quantity -= qty_from_batch
            batch.save()
            
            batches_used.append({
                'batch_id': batch.id,
                'quantity_used': qty_from_batch,
                'expiration_date': batch.expiration_date,
                'batch_code': batch.batch_code
            })
            
            remaining_to_withdraw -= qty_from_batch
        
        # ✅ RECALCULAR TOTAL DO INVENTÁRIO
        from django.db.models import Sum
        total_real = inventory_item.batches.aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        inventory_item.total_quantity = total_real
        inventory_item.save()
        
        print(f"📊 Total atualizado: {inventory_item.product.name} - {inventory_item.total_quantity}")
        
        return batches_used

    def perform_create(self, serializer):
        """✅ GARANTIR store_id E APLICAR FIFO"""
        try:
            store = ensure_user_has_store(self.request.user)
            print(f"🏪 perform_create - store_id: {store.id}")
            
            # ✅ FORÇAR store na criação
            instance = serializer.save(store=store)
            print(f"✅ StockTransaction {instance.id} criada com store_id: {instance.store_id}")
            
        except Exception as e:
            print(f"❌ Erro no perform_create: {e}")
            import traceback
            traceback.print_exc()
            raise

# inventory/views.py - ADICIONAR suporte a AJUSTE


    def create(self, request, *args, **kwargs):
        """✅ Create com FIFO AUTOMÁTICO para saídas (incluindo ajustes)"""
        try:
            store = ensure_user_has_store(request.user)
            if not store:
                return Response({'error': 'Loja não encontrada para o usuário'}, status=400)
            
            data = request.data.copy()
            print(f"🔄 CREATE - Dados recebidos: {data}")
            
            # ✅ VALIDAÇÕES OBRIGATÓRIAS
            required_fields = ['product', 'quantity', 'transaction_type']
            for field in required_fields:
                if not data.get(field):
                    return Response({'error': f'Campo {field} é obrigatório'}, status=400)
            
            # ✅ BUSCAR PRODUTO E INVENTÁRIO
            product_id = data.get('product_id') or data.get('product')
            try:
                from .models import Product, InventoryItem
                product = Product.objects.get(id=product_id)
                inventory_item = InventoryItem.objects.get(store=store, product=product)
                print(f"✅ Produto encontrado: {product.name}")
                print(f"✅ Inventário encontrado: {inventory_item.total_quantity} unidades")
            except Product.DoesNotExist:
                return Response({'error': 'Produto não encontrado'}, status=404)
            except InventoryItem.DoesNotExist:
                return Response({'error': 'Produto não está no seu estoque'}, status=404)
            
            quantity = abs(int(data.get('quantity', 0)))
            transaction_type = data.get('transaction_type', '').upper()
            # ⚠️ CORREÇÃO: era `float(...)`. O campo do modelo é DecimalField, e
            # o objeto é serializado logo abaixo SEM recarregar do banco — o
            # atributo em memória ficava como float puro. O serializer soma
            # `unit_price - unit_cost` (Decimal, vindo de inventory_item.cost_price)
            # para calcular o lucro, e Python não permite float - Decimal:
            # TypeError, capturado pelo except genérico e devolvido como 500
            # "Erro ao criar transação" — quebrava TODA baixa (venda, presente,
            # brinde, uso próprio, perda, ajuste).
            from decimal import Decimal, InvalidOperation
            try:
                unit_price = Decimal(str(data.get('unit_price', 0) or 0))
            except InvalidOperation:
                unit_price = Decimal('0')
            
            # ✅ VERIFICAR SE É SAÍDA E APLICAR FIFO (incluindo AJUSTE)
            is_exit = transaction_type in ['VENDA', 'USO_PROPRIO', 'PRESENTE', 'BRINDE', 'PERDA', 'SAIDA', 'AJUSTE']
            
            if is_exit:
                print(f"🔄 SAÍDA DETECTADA ({transaction_type}) - Aplicando FIFO para {quantity} unidades")
                
                # Verificar estoque suficiente
                if inventory_item.total_quantity < quantity:
                    return Response({
                        'error': 'Estoque insuficiente',
                        'available': inventory_item.total_quantity,
                        'requested': quantity
                    }, status=400)
                
                # ✅ APLICAR FIFO COM TRANSAÇÃO ATÔMICA
                from django.db import transaction as db_transaction
                with db_transaction.atomic():
                    try:
                        # Aplicar FIFO
                        batches_used = self.apply_fifo_withdrawal(inventory_item, quantity)
                        
                        # ✅ CRIAR TRANSAÇÃO COM QUANTIDADE NEGATIVA (saída)
                        transaction_obj = StockTransaction.objects.create(
                            store=store,
                            product=product,
                            transaction_type=transaction_type,
                            quantity=-quantity,  # ✅ NEGATIVO para saída
                            unit_price=unit_price,
                            unit_cost=inventory_item.cost_price or 0,
                            description=data.get('description', f"{transaction_type} - {product.name}")
                        )
                        
                        print(f"✅ Transação FIFO criada: {transaction_obj.id}")
                        print(f"✅ Novo total do estoque: {inventory_item.total_quantity}")
                        
                        serializer = self.get_serializer(transaction_obj)
                        return Response({
                            'message': f'{"Ajuste" if transaction_type == "AJUSTE" else "Baixa"} FIFO aplicada com sucesso',
                            'transaction': serializer.data,
                            'batches_used': batches_used,
                            'new_total_quantity': inventory_item.total_quantity,
                            'fifo_applied': True
                        }, status=201)
                        
                    except ValueError as ve:
                        print(f"❌ Erro no FIFO: {ve}")
                        return Response({'error': str(ve)}, status=400)
            
            else:
                # ✅ ENTRADA NORMAL (sem FIFO) - para ENTRADA ou outros tipos
                print(f"🔄 ENTRADA DETECTADA ({transaction_type}) - Sem FIFO")
                
                # ✅ Validar serializer
                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                
                # ✅ perform_create vai definir o store automaticamente
                self.perform_create(serializer)
                
                headers = self.get_success_headers(serializer.data)
                return Response(serializer.data, status=201, headers=headers)
            
        except Exception as e:
            print(f"❌ ERRO CRÍTICO no create: {e}")
            import traceback
            traceback.print_exc()
            
            return Response({
                'error': 'Erro ao criar transação',
                'message': str(e),
                'debug': {
                    'user_id': request.user.id,
                    'user_email': request.user.email,
                    'data': request.data
                }
            }, status=500)
# inventory/views.py - ADICIONAR esta view

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def inventory_item_batches_view(request, item_id):
    """Lista lotes de um item específico do inventário"""
    try:
        store = get_current_store(request.user)
        
        # Buscar item do inventário
        inventory_item = InventoryItem.objects.get(
            id=item_id, 
            store=store
        )
        
        # Buscar lotes ativos ordenados por validade (FIFO)
        batches = inventory_item.batches.filter(
            quantity__gt=0
        ).order_by('expiration_date', 'id')
        
        # Serializar lotes com informações extras
        batches_data = []
        today = timezone.now().date()
        
        for batch in batches:
            # Calcular status de validade
            is_expired = False
            days_to_expire = None
            status = 'valid'
            
            if batch.expiration_date:
                is_expired = batch.expiration_date < today
                if is_expired:
                    status = 'expired'
                else:
                    days_to_expire = (batch.expiration_date - today).days
                    if days_to_expire <= 30:
                        status = 'near_expiry'
            
            batches_data.append({
                'id': batch.id,
                'batch_code': batch.batch_code or 'S/N',
                'expiration_date': batch.expiration_date,
                'quantity': batch.quantity,
                'formatted_date': batch.expiration_date.strftime('%d/%m/%Y') if batch.expiration_date else 'Sem validade',
                'is_expired': is_expired,
                'is_near_expiry': status == 'near_expiry',
                'days_to_expire': days_to_expire,
                'status': status
            })
        
        return Response({
            'item_id': inventory_item.id,
            'product_name': inventory_item.product.name,
            'total_quantity': inventory_item.total_quantity,
            'batches': batches_data,
            'batch_stats': {
                'total_batches': len(batches_data),
                'expired_batches': len([b for b in batches_data if b['is_expired']]),
                'near_expiry_batches': len([b for b in batches_data if b['status'] == 'near_expiry']),
                'valid_batches': len([b for b in batches_data if b['status'] == 'valid'])
            }
        })
        
    except InventoryItem.DoesNotExist:
        return Response({'error': 'Item não encontrado'}, status=404)
    except Exception as e:
        print(f"❌ Erro ao buscar lotes: {e}")
        return Response({'error': 'Erro interno'}, status=500)
    



    # inventory/views.py - IMPLEMENTAR FIFO AUTOMÁTICO

from django.db.models import Sum, F
from django.db import transaction
from rest_framework.decorators import api_view, permission_classes

from rest_framework.response import Response
from datetime import datetime, timedelta, timedelta

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def apply_fifo_withdrawal(request):
    """Aplicar baixa FIFO automática nos lotes"""
    try:
        store = get_current_store(request.user)
        data = request.data
        
        product_id = data.get('product_id')
        quantity_to_withdraw = int(data.get('quantity', 0))
        transaction_type = data.get('transaction_type', 'SAIDA')
        unit_price = data.get('unit_price', 0)
        notes = data.get('notes', '')
        
        print(f"🎯 Iniciando FIFO: {quantity_to_withdraw} unidades do produto {product_id}")
        
        # Buscar produto e item do inventário
        product = Product.objects.get(id=product_id)
        inventory_item = InventoryItem.objects.get(store=store, product=product)
        
        # ✅ CONSOLIDAR lotes com mesma validade primeiro
        inventory_item = consolidate_batches_by_expiry(inventory_item)
        
        # Buscar lotes ordenados por validade (FIFO)
        available_batches = inventory_item.batches.filter(
            quantity__gt=0
        ).order_by('expiration_date', 'id')
        
        if not available_batches.exists():
            return Response({
                'error': 'Não há lotes disponíveis para este produto'
            }, status=400)
        
        # Verificar estoque total
        total_available = sum(batch.quantity for batch in available_batches)
        if total_available < quantity_to_withdraw:
            return Response({
                'error': f'Estoque insuficiente. Disponível: {total_available}, Solicitado: {quantity_to_withdraw}'
            }, status=400)
        
        # ✅ APLICAR FIFO AUTOMÁTICO
        with transaction.atomic():
            remaining_to_withdraw = quantity_to_withdraw
            batches_used = []
            transactions_created = []
            
            for batch in available_batches:
                if remaining_to_withdraw <= 0:
                    break
                
                qty_from_batch = min(remaining_to_withdraw, batch.quantity)
                
                print(f"📦 Lote {batch.id} (Val: {batch.expiration_date}): {batch.quantity} → {batch.quantity - qty_from_batch}")
                
                # Aplicar baixa no lote
                batch.quantity -= qty_from_batch
                batch.save()
                
                # Registrar transação para este lote
                stock_transaction = StockTransaction.objects.create(
                    store=store,
                    product=product,
                    batch=batch,
                    transaction_type=transaction_type,
                    quantity=-qty_from_batch,  # Negativo para saída
                    unit_cost=inventory_item.cost_price,
                    unit_price=unit_price,
                    description=f"Saída FIFO - Lote vencimento {batch.expiration_date}",
                    notes=notes
                )
                transactions_created.append(stock_transaction)
                
                # Se lote zerou, remover
                if batch.quantity == 0:
                    print(f"🗑️ Lote {batch.id} zerado - removendo")
                    batch.delete()
                
                batches_used.append({
                    'batch_id': batch.id,
                    'quantity_used': qty_from_batch,
                    'expiration_date': batch.expiration_date,
                    'remaining_quantity': batch.quantity
                })
                
                remaining_to_withdraw -= qty_from_batch
            
            # ✅ RECALCULAR TOTAL CONSOLIDADO
            total_real = inventory_item.batches.aggregate(
                total=Sum('quantity')
            )['total'] or 0
            
            inventory_item.total_quantity = total_real
            inventory_item.save()
            
            print(f"📊 Total atualizado: {inventory_item.total_quantity}")
            
            return Response({
                'message': 'Baixa FIFO aplicada com sucesso',
                'product_name': product.name,
                'quantity_withdrawn': quantity_to_withdraw,
                'new_total_quantity': inventory_item.total_quantity,
                'batches_used': batches_used,
                'transactions_created': len(transactions_created)
            })
            
    except Exception as e:
        print(f"❌ Erro no FIFO: {e}")
        import traceback
        traceback.print_exc()
        return Response({
            'error': 'Erro interno do servidor',
            'message': str(e)
        }, status=500)

def consolidate_batches_by_expiry(inventory_item):
    """Consolida lotes com a mesma data de validade"""
    from collections import defaultdict
    
    print(f"🔄 Consolidando lotes para {inventory_item.product.name}")
    
    # Agrupar lotes por data de validade
    batches_by_date = defaultdict(list)
    
    for batch in inventory_item.batches.filter(quantity__gt=0):
        date_key = batch.expiration_date.isoformat() if batch.expiration_date else 'no_date'
        batches_by_date[date_key].append(batch)
    
    # Consolidar lotes duplicados
    consolidated_count = 0
    for date_key, batches in batches_by_date.items():
        if len(batches) > 1:
            print(f"🔄 Consolidando {len(batches)} lotes com validade {date_key}")
            
            # Manter o primeiro lote e somar as quantidades
            main_batch = batches[0]
            total_quantity = sum(batch.quantity for batch in batches)
            
            # Atualizar quantidade do lote principal
            main_batch.quantity = total_quantity
            main_batch.save()
            
            # Remover lotes duplicados
            for batch in batches[1:]:
                print(f"🗑️ Removendo lote duplicado {batch.id}")
                batch.delete()
            
            consolidated_count += 1
    
    if consolidated_count > 0:
        print(f"✅ Consolidados {consolidated_count} grupos de lotes")
        
        # Recalcular total
        total_real = inventory_item.batches.aggregate(
            total=Sum('quantity')
        )['total'] or 0
        
        inventory_item.total_quantity = total_real
        inventory_item.save()
    
    return inventory_item
    


    # inventory/views.py - ADICIONAR função de debug
# inventory/views.py - ADICIONAR função de debug e associação

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def debug_user_store(request):
    """Debug: verificar se usuário tem loja"""
    try:
        user = request.user
        print(f"🔍 Debug usuário: {user.id} - {user.email}")
        
        # Verificar todas as lojas
        from .models import Store
        all_stores = Store.objects.all()
        user_stores = Store.objects.filter(owner=user)
        
        return Response({
            'user_id': user.id,
            'user_email': user.email,
            'all_stores': [
                {
                    'id': s.id, 
                    'name': s.name, 
                    'owner_id': s.owner_id,
                    'slug': getattr(s, 'slug', 'N/A')
                } for s in all_stores
            ],
            'user_stores': [
                {
                    'id': s.id, 
                    'name': s.name, 
                    'slug': getattr(s, 'slug', 'N/A')
                } for s in user_stores
            ],
            'current_store_function': get_current_store(user).id if get_current_store(user) else None
        })
        
    except Exception as e:
        return Response({
            'error': str(e),
            'user_id': request.user.id if request.user else None
        }, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def associate_user_store(request):
    """Associar usuário logado a uma loja específica"""
    try:
        user = request.user
        store_id = request.data.get('store_id')
        
        if not store_id:
            return Response({'error': 'store_id é obrigatório'}, status=400)
        
        from .models import Store
        
        try:
            store = Store.objects.get(id=store_id)
        except Store.DoesNotExist:
            return Response({'error': 'Loja não encontrada'}, status=404)
        
        # Associar usuário à loja
        store.owner = user
        store.save()
        
        print(f"✅ Usuário {user.email} associado à loja {store.name}")
        
        return Response({
            'message': f'Usuário associado à loja {store.name}',
            'store_id': store.id,
            'store_name': store.name,
            'user_email': user.email
        })
        
    except Exception as e:
        print(f"❌ Erro ao associar loja: {e}")
        return Response({'error': str(e)}, status=500)
    
    # inventory/views.py - ADICIONAR função de debug

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def fix_user_store(request):
    """✅ CORRIGIDO: Corrigir associação usuário-loja"""
    try:
        user = request.user
        
        # Verificar se já tem loja
        from .models import Store
        existing_stores = Store.objects.filter(owner=user)
        
        if existing_stores.exists():
            store = existing_stores.first()
            return Response({
                'message': 'Usuário já tem loja',
                'store_id': store.id,
                'store_name': store.name
            })
        
        # Criar nova loja
        store = Store.objects.create(
            owner=user,
            name=f"Loja de {user.email}",
            storefront_enabled=True,
            plan="free"
        )
        
        return Response({
            'message': 'Loja criada com sucesso',
            'store_id': store.id,
            'store_name': store.name
        })
        
    except Exception as e:
        return Response({
            'error': str(e),
            'message': 'Erro ao corrigir loja'
        }, status=500)
    

# inventory/views.py - FLUXO DE CAIXA COM DADOS EXISTENTES

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cash_flow_summary(request):
    """Fluxo de caixa baseado em StockTransaction existente"""
    try:
        store = ensure_user_has_store(request.user)
        
        # Período configurável
        period = request.GET.get('period', '30d')
        period_map = {'7d': 7, '30d': 30, '90d': 90, '180d': 180, '1y': 365}
        days = period_map.get(period, 30)
        start_date = timezone.now() - timedelta(days=days)
        
        # 💰 RECEITAS (baseado em vendas reais)
        revenue_transactions = StockTransaction.objects.filter(
            store=store,
            transaction_type='VENDA',
            created_at__gte=start_date,
            quantity__lt=0  # Saídas (vendas)
        )
        
        total_revenue = revenue_transactions.aggregate(
            total=Sum('unit_price')
        )['total'] or 0
        
        total_items_sold = abs(revenue_transactions.aggregate(
            total=Sum('quantity')
        )['total'] or 0)
        
        # 💸 CUSTOS (baseado em entradas de estoque)
        cost_transactions = StockTransaction.objects.filter(
            store=store,
            transaction_type='ENTRADA',
            created_at__gte=start_date,
            quantity__gt=0  # Entradas
        )
        
        total_invested = cost_transactions.aggregate(
            total=Sum(F('quantity') * F('unit_cost'))
        )['total'] or 0
        
        # 📊 LUCRO BRUTO (receita - custo dos produtos vendidos)
        cost_of_goods_sold = revenue_transactions.aggregate(
            total=Sum(F('quantity') * F('unit_cost'))  # quantity é negativo
        )['total'] or 0
        
        gross_profit = total_revenue + cost_of_goods_sold  # + porque quantity é negativo
        gross_margin = (gross_profit / max(total_revenue, 1)) * 100
        
        # 📈 FLUXO DIÁRIO
        daily_flow = []
        for i in range(min(days, 30)):  # Máximo 30 dias para performance
            day = start_date + timedelta(days=i)
            if day.date() > timezone.now().date():
                break
                
            # Receitas do dia
            day_revenue = StockTransaction.objects.filter(
                store=store,
                transaction_type='VENDA',
                created_at__date=day.date()
            ).aggregate(total=Sum('unit_price'))['total'] or 0
            
            # Investimentos do dia (compras de estoque)
            day_investment = StockTransaction.objects.filter(
                store=store,
                transaction_type='ENTRADA',
                created_at__date=day.date()
            ).aggregate(
                total=Sum(F('quantity') * F('unit_cost'))
            )['total'] or 0
            
            daily_flow.append({
                'date': day.strftime('%Y-%m-%d'),
                'day_name': day.strftime('%a'),
                'revenue': float(day_revenue),
                'investment': float(day_investment),
                'net_flow': float(day_revenue - day_investment)
            })
        
        # 🏆 PRODUTOS MAIS LUCRATIVOS
        profitable_products = StockTransaction.objects.filter(
            store=store,
            transaction_type='VENDA',
            created_at__gte=start_date
        ).values(
            'product__name',
            'product__id'
        ).annotate(
            total_revenue=Sum('unit_price'),
            total_cost=Sum(F('quantity') * F('unit_cost')),
            units_sold=Sum('quantity')
        ).annotate(
            profit=F('total_revenue') + F('total_cost')  # + porque quantity é negativo
        ).order_by('-profit')[:10]
        
        # 📊 ANÁLISE POR CATEGORIA
        category_analysis = StockTransaction.objects.filter(
            store=store,
            transaction_type='VENDA',
            created_at__gte=start_date
        ).values(
            'product__category'
        ).annotate(
            revenue=Sum('unit_price'),
            cost=Sum(F('quantity') * F('unit_cost')),
            profit=F('revenue') + F('cost'),
            units_sold=Sum('quantity')
        ).order_by('-revenue')
        
        return Response({
            'period_info': {
                'selected': period,
                'days': days,
                'start_date': start_date.date(),
                'end_date': timezone.now().date()
            },
            'summary': {
                'total_revenue': float(total_revenue),
                'total_invested': float(total_invested),
                'gross_profit': float(gross_profit),
                'gross_margin_percent': float(gross_margin),
                'total_items_sold': int(total_items_sold),
                'avg_ticket': float(total_revenue / max(revenue_transactions.count(), 1))
            },
            'daily_flow': daily_flow,
            'top_profitable_products': [
                {
                    'name': item['product__name'],
                    'revenue': float(item['total_revenue'] or 0),
                    'profit': float(item['profit'] or 0),
                    'units_sold': abs(int(item['units_sold'] or 0)),
                    'margin_percent': (float(item['profit'] or 0) / max(float(item['total_revenue'] or 1), 1)) * 100
                }
                for item in profitable_products
            ],
            'by_category': [
                {
                    'category': item['product__category'] or 'Sem categoria',
                    'revenue': float(item['revenue'] or 0),
                    'profit': float(item['profit'] or 0),
                    'units_sold': abs(int(item['units_sold'] or 0))
                }
                for item in category_analysis
            ]
        })
        
    except Exception as e:
        print(f"❌ Erro no fluxo de caixa: {e}")
        return Response({'error': str(e)}, status=500)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cash_flow_detailed(request):
    """Fluxo de caixa detalhado com todas as transações"""
    try:
        store = ensure_user_has_store(request.user)

        # 🔒 Recurso pago: valida o plano no servidor, não só na interface.
        bloqueio = _require_pro_feature(store, 'analytics')
        if bloqueio:
            return bloqueio

        # Filtros
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        transaction_type = request.GET.get('type')  # 'VENDA', 'ENTRADA', etc.
        
        # Query base
        transactions = StockTransaction.objects.filter(store=store)
        
        # Aplicar filtros
        if start_date:
            transactions = transactions.filter(created_at__date__gte=start_date)
        if end_date:
            transactions = transactions.filter(created_at__date__lte=end_date)
        if transaction_type:
            transactions = transactions.filter(transaction_type=transaction_type)
        
        # Ordenar por data
        transactions = transactions.select_related('product').order_by('-created_at')
        
        # Paginar
        from django.core.paginator import Paginator
        paginator = Paginator(transactions, 50)  # 50 por página
        page = request.GET.get('page', 1)
        transactions_page = paginator.get_page(page)
        
        # Serializar transações
        transactions_data = []
        for transaction in transactions_page:
            # Calcular valores financeiros
            if transaction.transaction_type == 'VENDA':
                financial_impact = transaction.unit_price  # Receita
                type_label = 'Receita'
                impact_type = 'income'
            elif transaction.transaction_type == 'ENTRADA':
                financial_impact = -(transaction.quantity * (transaction.unit_cost or 0))  # Investimento
                type_label = 'Investimento'
                impact_type = 'expense'
            else:
                financial_impact = 0
                type_label = transaction.transaction_type
                impact_type = 'neutral'
            
            transactions_data.append({
                'id': transaction.id,
                'date': transaction.created_at.date(),
                'time': transaction.created_at.time(),
                'product_name': transaction.product.name if transaction.product else 'N/A',
                'transaction_type': transaction.transaction_type,
                'type_label': type_label,
                'quantity': abs(transaction.quantity),
                'unit_price': float(transaction.unit_price or 0),
                'unit_cost': float(transaction.unit_cost or 0),
                'financial_impact': float(financial_impact),
                'impact_type': impact_type,
                'description': transaction.description or ''
            })
        
        return Response({
            'transactions': transactions_data,
            'pagination': {
                'current_page': transactions_page.number,
                'total_pages': paginator.num_pages,
                'total_items': paginator.count,
                'has_next': transactions_page.has_next(),
                'has_previous': transactions_page.has_previous()
            }
        })
        
    except Exception as e:
        print(f"❌ Erro no fluxo detalhado: {e}")
        return Response({'error': str(e)}, status=500) 
    
# inventory/views.py - ADICIONAR

# inventory/views.py - ENDPOINT SIMPLIFICADO

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_plan_limits_simple(request):
    """Endpoint simplificado para verificar limites (sem dependência de tabelas admin)"""
    try:
        store = get_current_store(request.user)
        if not store:
            return Response({'error': 'Loja não encontrada'}, status=400)
        
        # ✅ LÓGICA HARDCODED (sem dependência de plan_configs)
        current_count = store.items.values('product').distinct().count()
        
        # Definir limites baseado no plano (hardcoded temporariamente)
        if store.plan == 'free':
            limit = 20
            can_add = current_count < limit
        else:  # pro ou outros
            limit = None  # Ilimitado
            can_add = True
        
        return Response({
            'current_plan': store.plan,
            'current_count': current_count,
            'limit': limit,
            'can_add_products': can_add,
            'remaining': (limit - current_count) if limit else None
        })
        
    except Exception as e:
        print(f"❌ Erro ao verificar limites: {e}")
        return Response({
            'error': 'Erro ao verificar limites',
            'current_plan': 'free',
            'current_count': 0,
            'limit': 20,
            'can_add_products': True,
            'remaining': 20
        }, status=200)  # Retornar 200 com dados padrão para não quebrar
 # inventory/views.py - VERSÃO DINÂMICA
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_plan_limits_complete(request):
    try:
        store = get_current_store(request.user)
        current_count = store.items.values('product').distinct().count()
        
        # ✅ BUSCAR CONFIGURAÇÃO NA TABELA plan_configs
        try:
            from .models import PlanConfig
            plan_config = PlanConfig.objects.filter(plan_type=store.plan).first()
            
            if plan_config:
                limit = plan_config.max_products  # ← VINDO DO BANCO
                features = {
                    'scanner': plan_config.can_use_scanner,
                    'storefront': plan_config.can_use_storefront,
                    'alerts': plan_config.can_use_alerts,
                    'ai_assistant': plan_config.can_use_ai_assistant,
                    'analytics': plan_config.can_use_analytics,
                }
            else:
                raise Exception("PlanConfig não encontrado")
                
        except Exception as e:
            print(f"⚠️ Usando limites hardcoded: {e}")
            # Fallback hardcoded (se tabela não existir)
            if store.plan == 'free':
                limit = 20
                features = {'scanner': True, 'storefront': False}
            else:
                limit = None
                features = {'scanner': True, 'storefront': True}
        
        can_add = (limit is None) or (current_count < limit)
        
        return Response({
            'current_plan': store.plan,
            'current_count': current_count,
            'limit': limit,  # ← VALOR DINÂMICO DO BANCO
            'can_add_products': can_add,
            'remaining': (limit - current_count) if limit else None,
            'features': features  # ← RECURSOS DINÂMICOS
        })
    except Exception as e:
        print(f"❌ Erro ao verificar limites completo: {e}")
        return Response({
            'error': 'Erro ao verificar limites',
            'current_plan': 'free',
            'current_count': 0,
            'limit': 20,
            'can_add_products': True,
            'remaining': 20,
            'features': {'scanner': True, 'storefront': False}
        }, status=200)

# backend/core/inventory/views.py (adicionar)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework import status

class ThemeConfigPublicView(APIView):
    """
    GET público — qualquer pessoa pode ler o tema.
    Não requer autenticação (landing page precisa).
    """
    permission_classes = [AllowAny]
    
    def get(self, request):
        theme = ThemeConfig.load()
        serializer = ThemeConfigSerializer(theme)
        return Response(serializer.data)


class ThemeConfigAdminView(APIView):
    """
    GET/PATCH protegido — apenas admin pode alterar.
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        theme = ThemeConfig.load()
        serializer = ThemeConfigSerializer(theme)
        return Response(serializer.data)
    
    def patch(self, request):
        theme = ThemeConfig.load()
        serializer = ThemeConfigSerializer(theme, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    store = ensure_user_has_store(request.user)
    items = InventoryItem.objects.filter(store=store)
    transactions = StockTransaction.objects.filter(store=store)
    
    # 1. Valor Investido (custo * quantidade)
    invested = items.aggregate(total=Sum(F('cost_price') * F('total_quantity')))['total'] or 0
    
    # 2. Potencial de Venda (preço_venda * quantidade)
    potential = items.aggregate(total=Sum(F('sale_price') * F('total_quantity')))['total'] or 0
    
    # 3. Vendas e Lucro do Mês
    now = timezone.now()
    month_txs = transactions.filter(
        created_at__year=now.year,
        created_at__month=now.month,
        transaction_type='VENDA'
    )
    month_sales = month_txs.aggregate(total=Sum(F('unit_price') * F('quantity')))['total'] or 0
    # ⚠️ CORREÇÃO: StockTransaction não tem campo 'profit' (nunca teve) — o
    # aggregate anterior (Sum(F('profit'))) sempre lançava FieldError e
    # derrubava esse endpoint com 500. Lucro = (preço de venda - custo) * quantidade.
    month_profit = month_txs.aggregate(
        total=Sum((F('unit_price') - F('unit_cost')) * F('quantity'))
    )['total'] or 0
    
    return Response({
        "investedValue": float(invested),
        "potentialValue": float(potential),
        "projectedProfit": float(potential - invested),
        "monthSales": float(month_sales),
        "monthProfit": float(month_profit)
    })


# ==========================================
# ENDPOINTS LGPD - GESTÃO DE CONSENTIMENTO
# ==========================================
# backend/core/inventory/views.py - record_consent CORRIGIDA
# inventory/views.py
@api_view(['POST'])
@permission_classes([AllowAny])
def record_consent(request):
    """Registra novo consentimento LGPD"""
    from .serializers import ConsentRecordSerializer
    
    # Adicionar metadados da requisição ao contexto
    serializer = ConsentRecordSerializer(
        data=request.data, 
        context={
            'request': request,
            'ip_address': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT', '')[:500],
        }
    )
    
    if serializer.is_valid():
        consent = serializer.save()
        
        return Response({
            "status": "consent_recorded",
            "consent_id": consent.id,
            "version": consent.term_version,
            "purposes_granted": consent.purpose_flags,
            "can_revoke": [
                p for p in consent.purpose_flags 
                if p not in getattr(settings, 'LGPD_ESSENTIAL_PURPOSES', [])
            ]
        }, status=status.HTTP_201_CREATED)
    
    return Response({
        "status": "error",
        "errors": serializer.errors
    }, status=status.HTTP_400_BAD_REQUEST)

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def revoke_consent(request, purpose: str):
    """Revoga consentimento para finalidade específica"""
    from .serializers import ConsentRevocationSerializer
    
    # Validar que a finalidade é revogável
    if purpose in getattr(settings, 'LGPD_ESSENTIAL_PURPOSES', []):
        return Response({
            "error": f"A finalidade '{purpose}' é essencial e não pode ser revogada"
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Buscar consentimento ativo do usuário
    consent = ConsentRecord.objects.filter(
        user=request.user,
        purpose_flags__contains=[purpose],
        revoked_at__isnull=True
    ).first()
    
    if not consent:
        return Response({
            "error": "Consentimento não encontrado para esta finalidade"
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Revogar
    consent.revoke(purpose=purpose)
    
    return Response({
        "status": "revoked",
        "purpose": purpose,
        "revoked_at": consent.revoked_at.isoformat()
    }, status=status.HTTP_200_OK)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_my_consents(request):
    """Lista todos os consentimentos do usuário logado"""
    from .serializers import ConsentSummarySerializer
    
    consents = ConsentRecord.objects.filter(
        user=request.user
    ).order_by('-accepted_at')
    
    serializer = ConsentSummarySerializer(consents, many=True)
    
    return Response({
        "consents": serializer.data,
        "current_version": getattr(settings, 'LGPD_CONSENT_VERSION', 'v1.0_2026-05'),
        "essential_purposes": getattr(settings, 'LGPD_ESSENTIAL_PURPOSES', []),
        "revocable_purposes": [
            p for p, _ in ConsentRecord.PURPOSE_CHOICES 
            if p not in getattr(settings, 'LGPD_ESSENTIAL_PURPOSES', [])
        ]
    }, status=status.HTTP_200_OK)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_my_data(request):
    """
    Portabilidade de dados (Art. 18, V) - Exporta dados do usuário
    GET /api/consent/export/
    """
    store = ensure_user_has_store(request.user)
    
    # Limita período para evitar exportação massiva
    cutoff_date = timezone.now() - timedelta(days=730)  # 2 anos
    
    # Coleta dados de forma paginada/limitada
    inventory = InventoryItem.objects.filter(
        store=store, updated_at__gte=cutoff_date
    ).select_related('product')[:500]  # Limite de segurança
    
    transactions = StockTransaction.objects.filter(
        store=store, created_at__gte=cutoff_date
    ).select_related('product', 'batch')[:1000]
    
    log_safe("Exportação de dados solicitada", user_id=request.user.id, store_id=store.id)
    
    return Response({
        "exported_at": timezone.now().isoformat(),
        "user_email": request.user.email,
        "store_slug": store.slug,
        "period": {"from": cutoff_date.isoformat(), "to": timezone.now().isoformat()},
        "inventory_count": inventory.count(),
        "transactions_count": transactions.count(),
        "inventory": InventoryItemSerializer(inventory, many=True).data,
        "transactions": StockTransactionSerializer(transactions, many=True).data,
        "note": "Dados exportados conforme Art. 18, V da LGPD"
    })

# ==========================================
# 💰 FLUXO DE CAIXA SIMPLIFICADO (MEI)
# ==========================================
# Princípio de design: "se não é produto cadastrado, não gera movimento
# financeiro". A consultora nunca lança despesa manualmente — o caixa é um
# subproduto automático da gestão de estoque. Isso elimina o erro de
# "esqueci de lançar" e mantém a adoção alta.
#
# Entradas  = vendas          (quantidade × preço de venda)
# Saídas    = compras de estoque (quantidade × custo)
# Sobra     = entradas − saídas
#
# ⚠️ Os números são estimativas de gestão baseadas no que foi registrado no
# sistema. Não substituem contabilidade: vendas feitas fora do app, taxas de
# maquininha e outras despesas não aparecem aqui.

# Teto de receita bruta anual do MEI. Em vigor desde 2018, mantido em 2026.
# Se a lei mudar, basta atualizar esta constante.
MEI_LIMITE_ANUAL = Decimal('81000.00')
# Acima de 20% de excesso o desenquadramento é retroativo ao início do ano.
MEI_TOLERANCIA_20 = MEI_LIMITE_ANUAL * Decimal('1.20')


def _receita_periodo(store, inicio=None, fim=None):
    """
    Receita bruta (vendas) no período.

    ⚠️ CORREÇÃO: antes o cálculo era `unit_price * (quantity * -1)`, partindo
    do princípio de que TODA venda é gravada com quantidade negativa. Bastava
    um registro com quantidade positiva para a receita virar NEGATIVA — foi o
    que aconteceu em produção ("-R$ 919,50 de R$ 81.000").

    Agora usamos o valor absoluto: vender 5 unidades é 5 unidades,
    independentemente de como o sinal foi gravado.
    """
    qs = StockTransaction.objects.filter(store=store, transaction_type='VENDA')
    if inicio:
        qs = qs.filter(created_at__gte=inicio)
    if fim:
        qs = qs.filter(created_at__lt=fim)
    total = qs.aggregate(
        s=Sum(F('unit_price') * Abs(F('quantity')))
    )['s']
    return Decimal(total or 0)


def _compras_periodo(store, inicio=None, fim=None):
    """Saída de caixa: compras de estoque (ENTRADA), quantidade positiva."""
    qs = StockTransaction.objects.filter(store=store, transaction_type='ENTRADA')
    if inicio:
        qs = qs.filter(created_at__gte=inicio)
    if fim:
        qs = qs.filter(created_at__lt=fim)
    # Valor absoluto pelo mesmo motivo da receita: o sinal não é confiável.
    total = qs.aggregate(s=Sum(F('unit_cost') * Abs(F('quantity'))))['s']
    return Decimal(total or 0)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mei_summary(request):
    """
    GET /api/mei/summary/ → Fluxo de caixa simplificado + controle do teto MEI.

    Parâmetro opcional `year` (padrão: ano corrente).
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    agora = timezone.localtime()
    try:
        ano = int(request.GET.get('year', agora.year))
    except (TypeError, ValueError):
        ano = agora.year

    # ── Período escolhido (cards de caixa) ──
    # O TETO do MEI continua sendo sempre anual — é assim na lei. O filtro
    # afeta só os cards de entrada/saída/sobra, para ela poder olhar o dia,
    # o mês ou o ano.
    periodo, ini_p, fim_p, rotulo_p = _intervalo_da_requisicao(request)
    entradas_mes = _receita_periodo(store, ini_p, fim_p)
    saidas_mes = _compras_periodo(store, ini_p, fim_p)

    # ── Ano ──
    inicio_ano = agora.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    if ano != agora.year:
        inicio_ano = inicio_ano.replace(year=ano)
    fim_ano = inicio_ano.replace(year=ano + 1)

    receita_ano = _receita_periodo(store, inicio_ano, fim_ano)
    compras_ano = _compras_periodo(store, inicio_ano, fim_ano)

    # ── Detalhamento mês a mês (base do Relatório Mensal de Receitas) ──
    meses = []
    for m in range(1, 13):
        ini = inicio_ano.replace(month=m)
        fim = ini.replace(year=ano + 1, month=1) if m == 12 else ini.replace(month=m + 1)
        if ini > agora:
            break
        meses.append({
            'mes': m,
            'entradas': float(_receita_periodo(store, ini, fim)),
            'saidas': float(_compras_periodo(store, ini, fim)),
        })

    # ── Situação frente ao teto ──
    percentual = float(receita_ano / MEI_LIMITE_ANUAL * 100) if MEI_LIMITE_ANUAL else 0.0
    if receita_ano > MEI_TOLERANCIA_20:
        situacao = 'excedido_grave'
    elif receita_ano > MEI_LIMITE_ANUAL:
        situacao = 'excedido'
    elif percentual >= 80:
        situacao = 'atencao'
    else:
        situacao = 'ok'

    return Response({
        'ano': ano,
        'periodo': periodo,
        'periodo_rotulo': rotulo_p,
        # `mes_atual` mantém o nome por compatibilidade, mas agora reflete o
        # período escolhido no filtro.
        'mes_atual': {
            'entradas': float(entradas_mes),
            'saidas': float(saidas_mes),
            'sobra': float(entradas_mes - saidas_mes),
        },
        'ano_atual': {
            'receita_bruta': float(receita_ano),
            'compras': float(compras_ano),
            'sobra': float(receita_ano - compras_ano),
        },
        'mei': {
            'limite': float(MEI_LIMITE_ANUAL),
            'percentual_usado': round(percentual, 1),
            'restante': float(max(MEI_LIMITE_ANUAL - receita_ano, Decimal('0'))),
            'situacao': situacao,
        },
        'meses': meses,
        'aviso': (
            'Valores calculados a partir das movimentações registradas no '
            'sistema. São estimativas de gestão e não substituem orientação '
            'contábil.'
        ),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mei_report_csv(request):
    """
    GET /api/mei/report/?year=2026 → Relatório para o contador (CSV).

    Formato CSV de propósito: abre no Excel e no Google Sheets, é aceito por
    qualquer contador e não depende de biblioteca de PDF no servidor.
    """
    import csv
    from django.http import HttpResponse

    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    agora = timezone.localtime()
    try:
        ano = int(request.GET.get('year', agora.year))
    except (TypeError, ValueError):
        ano = agora.year

    inicio_ano = agora.replace(year=ano, month=1, day=1, hour=0, minute=0,
                               second=0, microsecond=0)
    fim_ano = inicio_ano.replace(year=ano + 1)

    receita_ano = _receita_periodo(store, inicio_ano, fim_ano)
    compras_ano = _compras_periodo(store, inicio_ano, fim_ano)

    resp = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    resp['Content-Disposition'] = f'attachment; filename="relatorio-mei-{ano}.csv"'
    w = csv.writer(resp, delimiter=';')  # ; abre direto no Excel em pt-BR

    nome = getattr(store, 'name', '') or ''
    email = getattr(getattr(store, 'owner', None), 'email', '') or ''

    w.writerow([f'Relatório de Receitas — {ano}'])
    w.writerow(['Consultora', nome])
    w.writerow(['E-mail', email])
    w.writerow(['Gerado em', agora.strftime('%d/%m/%Y %H:%M')])
    w.writerow([])
    w.writerow(['RECEITA BRUTA ANUAL (valor da DASN-SIMEI)',
                f'{receita_ano:.2f}'.replace('.', ',')])
    w.writerow(['Compras de estoque no ano', f'{compras_ano:.2f}'.replace('.', ',')])
    w.writerow(['Sobra (receita - compras)',
                f'{(receita_ano - compras_ano):.2f}'.replace('.', ',')])
    w.writerow([])
    w.writerow(['Mês', 'Entradas (vendas)', 'Saídas (compras de estoque)', 'Sobra'])

    nomes_meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    for m in range(1, 13):
        ini = inicio_ano.replace(month=m)
        fim = fim_ano if m == 12 else inicio_ano.replace(month=m + 1)
        ent = _receita_periodo(store, ini, fim)
        sai = _compras_periodo(store, ini, fim)
        w.writerow([
            nomes_meses[m - 1],
            f'{ent:.2f}'.replace('.', ','),
            f'{sai:.2f}'.replace('.', ','),
            f'{(ent - sai):.2f}'.replace('.', ','),
        ])

    w.writerow([])
    w.writerow(['Observação: este relatório reflete apenas movimentações de '
                'produtos cadastrados no sistema. Vendas fora do aplicativo, '
                'taxas e outras despesas não estão incluídas.'])
    w.writerow(['Não substitui orientação contábil.'])
    return resp

# ==========================================
# 📊 RELATÓRIOS DA CONSULTORA (dashboard)
# ==========================================
# Endpoint único que alimenta o Dashboard inteiro, com filtro de período.
# Evita 4 ou 5 chamadas em paralelo — no celular, cada requisição extra é
# latência que a consultora sente.
#
# Períodos: 'dia' (hoje), 'mes' (mês corrente), 'ano' (ano corrente).

# Períodos aceitos pelos relatórios. A chave é o que o frontend envia.
PERIODOS_EM_DIAS = {'30d': 30, '60d': 60, '90d': 90}
PERIODOS_ACEITOS = set(PERIODOS_EM_DIAS) | {'dia', 'mes', 'ano', 'custom'}


def _intervalo_da_requisicao(request):
    """
    Resolve o intervalo a partir da querystring.

    Aceita:
      • period=30d|60d|90d|ano|mes|dia  → janelas prontas
      • period=custom&start=AAAA-MM-DD&end=AAAA-MM-DD → intervalo escolhido
        pela consultora no calendário

    Datas inválidas ou invertidas caem no padrão de 30 dias, para a tela nunca
    quebrar por causa de um parâmetro malformado.
    """
    from datetime import datetime as _dt

    periodo = request.GET.get('period', '30d')

    if periodo == 'custom':
        bruto_ini = request.GET.get('start')
        bruto_fim = request.GET.get('end')
        try:
            d_ini = _dt.strptime(bruto_ini, '%Y-%m-%d').date()
            d_fim = _dt.strptime(bruto_fim, '%Y-%m-%d').date()
            if d_fim < d_ini:
                d_ini, d_fim = d_fim, d_ini
            tz = timezone.get_current_timezone()
            ini = timezone.make_aware(_dt.combine(d_ini, _dt.min.time()), tz)
            # fim exclusivo: inclui o dia inteiro escolhido
            fim = timezone.make_aware(
                _dt.combine(d_fim, _dt.min.time()), tz) + timedelta(days=1)
            rotulo = f'{d_ini:%d/%m/%Y} a {d_fim:%d/%m/%Y}'
            return periodo, ini, fim, rotulo
        except (TypeError, ValueError):
            periodo = '30d'

    if periodo not in PERIODOS_ACEITOS:
        periodo = '30d'
    ini, fim, rotulo = _intervalo_periodo(periodo)
    return periodo, ini, fim, rotulo


def _intervalo_periodo(periodo: str):
    """
    Devolve (inicio, fim, rotulo) para o período pedido.

    Aceita janelas em dias ('30d', '60d', '90d') — que é o que o filtro da
    tela usa — e também os períodos de calendário ('dia', 'mes', 'ano'),
    mantidos para não quebrar chamadas antigas.
    """
    agora = timezone.localtime()

    # Janela em dias corridos, terminando agora.
    dias = PERIODOS_EM_DIAS.get(periodo)
    if dias:
        inicio_do_dia = agora.replace(hour=0, minute=0, second=0, microsecond=0)
        ini = inicio_do_dia - timedelta(days=dias - 1)
        return ini, agora + timedelta(seconds=1), f'Últimos {dias} dias'

    if periodo == 'dia':
        ini = agora.replace(hour=0, minute=0, second=0, microsecond=0)
        return ini, ini + timedelta(days=1), 'Hoje'
    if periodo == 'ano':
        ini = agora.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        return ini, ini.replace(year=ini.year + 1), f'{agora.year}'
    if periodo == 'mes':
        ini = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fim = ini.replace(year=ini.year + 1, month=1) if ini.month == 12 else ini.replace(month=ini.month + 1)
        return ini, fim, ini.strftime('%m/%Y')

    # Desconhecido: cai no padrão de 30 dias.
    inicio_do_dia = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio_do_dia - timedelta(days=29), agora + timedelta(seconds=1), 'Últimos 30 dias'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def consultant_reports(request):
    """
    GET /api/reports/?period=dia|mes|ano

    Retorna, em uma só resposta:
      • resumo      — entradas, saídas e lucro do período
      • fluxo       — linhas de entrada/saída para a tabela
      • evolucao    — série para o gráfico (por dia, mês ou mês do ano)
      • top_produtos— 10 mais vendidos no período
      • saidas      — saídas detalhadas com a descrição da consultora
      • acabando    — produtos com estoque baixo
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    bloqueio = _require_pro_feature(store, 'analytics')
    if bloqueio:
        return bloqueio

    periodo, inicio, fim, rotulo = _intervalo_da_requisicao(request)

    txs = (StockTransaction.objects
           .filter(store=store, created_at__gte=inicio, created_at__lt=fim)
           .select_related('product')
           .order_by('-created_at'))

    # ── Resumo ──
    # Entrada de caixa = venda. Saída de caixa = compra de estoque.
    # Presente, brinde, uso próprio e perda NÃO entram no caixa: não houve
    # dinheiro trocando de mão. Eles aparecem na tabela de saídas de produto,
    # que é outra coisa.
    entradas = Decimal('0')
    saidas_caixa = Decimal('0')
    custo_vendido = Decimal('0')

    for t in txs:
        qtd = t.quantity or 0
        if t.transaction_type == 'VENDA':
            entradas += (t.unit_price or 0) * abs(qtd)
            custo_vendido += (t.unit_cost or 0) * abs(qtd)
        elif t.transaction_type == 'ENTRADA':
            saidas_caixa += (t.unit_cost or 0) * qtd

    lucro = entradas - custo_vendido

    # ── Tabela de fluxo de caixa ──
    fluxo = []
    for t in txs:
        qtd = abs(t.quantity or 0)
        if t.transaction_type == 'VENDA':
            valor = float((t.unit_price or 0) * qtd)
            tipo, natureza = 'Venda', 'entrada'
        elif t.transaction_type == 'ENTRADA':
            valor = float((t.unit_cost or 0) * qtd)
            tipo, natureza = 'Compra de estoque', 'saida'
        else:
            continue  # só movimento de dinheiro nesta tabela
        fluxo.append({
            'id': t.id,
            'data': t.created_at.date(),
            'tipo': tipo,
            'natureza': natureza,
            'produto': t.product.name if t.product else '—',
            'quantidade': qtd,
            'valor': valor,
            'descricao': t.description or '',
        })

    # ── Evolução (gráfico) ──
    # dia  → por hora não ajuda; usamos os últimos 7 dias para dar contexto
    # mes  → dia a dia do mês
    # ano  → mês a mês
    evolucao = []
    if periodo == 'ano':
        for m in range(1, 13):
            ini_m = inicio.replace(month=m)
            fim_m = fim if m == 12 else inicio.replace(month=m + 1)
            if ini_m > timezone.localtime():
                break
            ent = sai = Decimal('0')
            for t in txs:
                if ini_m <= t.created_at < fim_m:
                    q = abs(t.quantity or 0)
                    if t.transaction_type == 'VENDA':
                        ent += (t.unit_price or 0) * q
                    elif t.transaction_type == 'ENTRADA':
                        sai += (t.unit_cost or 0) * q
            evolucao.append({
                'rotulo': ini_m.strftime('%b'),
                'entradas': float(ent),
                'saidas': float(sai),
                'saldo': float(ent - sai),
            })
    else:
        dias = 7 if periodo == 'dia' else max(1, (fim - inicio).days)
        base = (timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
                - timedelta(days=6)) if periodo == 'dia' else inicio
        # Para 'dia' precisamos olhar além do intervalo do resumo.
        origem = (StockTransaction.objects
                  .filter(store=store, created_at__gte=base)
                  .select_related('product')) if periodo == 'dia' else txs

        # Agrupamento conforme o tamanho da janela: um gráfico com 90 barras
        # diárias (ou 700, num intervalo personalizado longo) fica ilegível
        # na tela de um celular.
        if dias > 120:
            passo = 30      # blocos de ~1 mês
        elif dias > 45:
            passo = 7       # blocos de 1 semana
        else:
            passo = 1       # dia a dia
        agora_local = timezone.localtime()

        d = 0
        while d < dias:
            ini_d = base + timedelta(days=d)
            fim_d = min(ini_d + timedelta(days=passo), base + timedelta(days=dias))
            if ini_d > agora_local:
                break
            ent = sai = Decimal('0')
            for t in origem:
                if ini_d <= t.created_at < fim_d:
                    q = abs(t.quantity or 0)
                    if t.transaction_type == 'VENDA':
                        ent += (t.unit_price or 0) * q
                    elif t.transaction_type == 'ENTRADA':
                        sai += (t.unit_cost or 0) * q
            evolucao.append({
                'rotulo': ini_d.strftime('%d/%m'),
                'entradas': float(ent),
                'saidas': float(sai),
                'saldo': float(ent - sai),
            })
            d += passo

    # ── Top 10 mais vendidos ──
    por_produto = {}
    for t in txs:
        if t.transaction_type != 'VENDA':
            continue
        nome = t.product.name if t.product else '—'
        q = abs(t.quantity or 0)
        d = por_produto.setdefault(nome, {'produto': nome, 'quantidade': 0, 'receita': Decimal('0')})
        d['quantidade'] += q
        d['receita'] += (t.unit_price or 0) * q
    top = sorted(por_produto.values(), key=lambda x: x['quantidade'], reverse=True)[:10]
    top_produtos = [
        {'produto': i['produto'], 'quantidade': i['quantidade'], 'receita': float(i['receita'])}
        for i in top
    ]

    # ── Saídas de produto (com a descrição da consultora) ──
    # Aqui entram TODAS as saídas — venda, presente, brinde, uso próprio,
    # perda — porque a pergunta é "para onde foi meu produto".
    rotulos_tipo = {
        'VENDA': 'Venda', 'PRESENTE': 'Presente', 'BRINDE': 'Brinde',
        'USO_PROPRIO': 'Uso próprio', 'PERDA': 'Perda', 'AJUSTE': 'Ajuste',
    }
    saidas = []
    for t in txs:
        if t.transaction_type == 'ENTRADA' or (t.quantity or 0) >= 0:
            continue
        q = abs(t.quantity or 0)
        # Presente/uso próprio não têm receita: mostramos o custo, que é o
        # valor que saiu do bolso dela.
        unit = (t.unit_price if t.transaction_type == 'VENDA' else t.unit_cost) or 0
        saidas.append({
            'id': t.id,
            'data': t.created_at.date(),
            'produto': t.product.name if t.product else '—',
            'tipo': rotulos_tipo.get(t.transaction_type, t.transaction_type),
            'valor_unitario': float(unit),
            'quantidade': q,
            'total': float(unit * q),
            'descricao': t.description or '',
        })

    # ── Produtos acabando ──
    acabando = [
        {
            'id': it.id,
            'produto': it.product.name if it.product else '—',
            'estoque': it.total_quantity or 0,
            'minimo': it.min_quantity if it.min_quantity is not None else 0,
        }
        for it in InventoryItem.objects.filter(store=store).select_related('product')
        if (it.total_quantity or 0) <= (it.min_quantity if it.min_quantity is not None else 0)
    ][:20]

    return Response({
        'periodo': periodo,
        'rotulo': rotulo,
        'resumo': {
            'entradas': float(entradas),
            'saidas': float(saidas_caixa),
            'lucro': float(lucro),
            'custo_vendido': float(custo_vendido),
        },
        'fluxo': fluxo[:100],
        'evolucao': evolucao,
        'top_produtos': top_produtos,
        'saidas': saidas[:100],
        'acabando': acabando,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def public_plans_view(request):
    """
    GET /api/plans/ → planos visíveis com preços reais (público).

    Estava declarada dentro de core/urls.py, o que é lugar de roteamento e
    não de view. Trazida para cá junto com a limpeza das URLs duplicadas.
    """
    plans = PlanConfig.objects.filter(is_visible=True).order_by('sort_order')
    return Response(PlanConfigSerializer(plans, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_promotions_view(request):
    """
    GET /api/promotions/active/ — promoções que a loja de quem está logado
    deve ver agora. Sem isso, o admin podia criar e ativar uma promoção que
    NUNCA aparecia pra ninguém — o recurso não tinha efeito nenhum fora do
    próprio painel administrativo.

    Prioridade: se a promoção tem `target_stores` preenchido, só aparece
    pras lojas selecionadas ali (alvo específico, mais forte). Senão, cai no
    segmento amplo de `target_audience` (todos / free / pro / novos /
    inativos) — o comportamento que já existia.
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response([])

    agora = timezone.now()
    base = Promotion.objects.filter(is_active=True, starts_at__lte=agora).filter(
        Q(ends_at__isnull=True) | Q(ends_at__gte=agora)
    ).exclude(
        max_views__isnull=False, current_views__gte=F('max_views')
    )

    candidatas = []
    for promo in base:
        if promo.target_stores.exists():
            # Alvo específico: só vale se ESTA loja estiver na lista.
            if promo.target_stores.filter(id=store.id).exists():
                candidatas.append(promo)
            continue

        # Sem alvo específico: cai no segmento amplo de sempre.
        alvo = promo.target_audience
        if alvo == 'all':
            candidatas.append(promo)
        elif alvo == 'free' and store.plan != 'pro':
            candidatas.append(promo)
        elif alvo == 'pro' and store.plan == 'pro':
            candidatas.append(promo)
        elif alvo == 'new_users' and store.created_at >= agora - timedelta(days=7):
            candidatas.append(promo)
        elif alvo == 'inactive':
            ativo_recente = UserBehaviorLog.objects.filter(
                store=store, created_at__gte=agora - timedelta(days=30)
            ).exists()
            if not ativo_recente:
                candidatas.append(promo)

    return Response(PromotionSerializer(candidatas, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def movements_report_csv(request):
    """
    GET /api/movements/report/?period=dia|mes|ano|tudo

    Relatório de movimentação de estoque em CSV — entradas, saídas, valores,
    lucro e a descrição preenchida pela consultora.

    CSV (e não PDF) porque abre no Excel e no Google Sheets sem depender de
    biblioteca extra no servidor.
    """
    import csv
    from django.http import HttpResponse

    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    periodo = request.GET.get('period', 'tudo')
    qs = StockTransaction.objects.filter(store=store).select_related('product')
    if periodo != 'tudo':
        periodo, inicio, fim, rotulo = _intervalo_da_requisicao(request)
        qs = qs.filter(created_at__gte=inicio, created_at__lt=fim)
    else:
        rotulo = 'completo'
    qs = qs.order_by('-created_at')

    agora = timezone.localtime()
    resp = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    resp['Content-Disposition'] = (
        f'attachment; filename="movimentacoes-{periodo}-{agora:%Y%m%d}.csv"'
    )
    w = csv.writer(resp, delimiter=';')  # ; abre direto no Excel em pt-BR

    rotulos = {
        'ENTRADA': 'Entrada de estoque', 'VENDA': 'Venda', 'PRESENTE': 'Presente',
        'BRINDE': 'Brinde', 'USO_PROPRIO': 'Uso próprio', 'PERDA': 'Perda',
        'AJUSTE': 'Ajuste',
    }
    fmt = lambda v: f'{v:.2f}'.replace('.', ',')

    w.writerow([f'Movimentações de estoque — {rotulo}'])
    w.writerow(['Loja', store.name])
    w.writerow(['Gerado em', agora.strftime('%d/%m/%Y %H:%M')])
    w.writerow([])
    w.writerow(['Data', 'Tipo', 'Produto', 'Quantidade', 'Valor unitário',
                'Total', 'Lucro', 'Descrição'])

    tot_ent = tot_sai = tot_lucro = Decimal('0')
    for t in qs:
        qtd = abs(t.quantity or 0)
        eh_venda = t.transaction_type == 'VENDA'
        unit = (t.unit_price if eh_venda else t.unit_cost) or Decimal('0')
        total = unit * qtd
        lucro = ((t.unit_price or 0) - (t.unit_cost or 0)) * qtd if eh_venda else None

        if t.transaction_type == 'ENTRADA':
            tot_sai += total
        elif eh_venda:
            tot_ent += total
            tot_lucro += lucro or 0

        w.writerow([
            t.created_at.strftime('%d/%m/%Y %H:%M'),
            rotulos.get(t.transaction_type, t.transaction_type),
            t.product.name if t.product else '—',
            qtd,
            fmt(unit),
            fmt(total),
            fmt(lucro) if lucro is not None else '',
            t.description or '',
        ])

    w.writerow([])
    w.writerow(['RESUMO'])
    w.writerow(['Total de vendas (entrou)', fmt(tot_ent)])
    w.writerow(['Total de compras (saiu)', fmt(tot_sai)])
    w.writerow(['Lucro das vendas', fmt(tot_lucro)])
    w.writerow([])
    w.writerow(['Observação: valores calculados a partir das movimentações '
                'registradas no sistema.'])
    return resp


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def stock_report_csv(request):
    """
    GET /api/stock/report/

    Relatório do estoque ATUAL (foto do momento) em CSV: o que tem, quanto
    tem, quanto custou, quanto vale e o que está para vencer.

    Diferente de /api/movements/report/, que é o histórico do que entrou e
    saiu. Aqui a pergunta é "o que eu tenho hoje".
    """
    import csv
    from django.http import HttpResponse

    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    agora = timezone.localtime()
    hoje = agora.date()

    itens = (InventoryItem.objects
             .filter(store=store)
             .select_related('product')
             .prefetch_related('batches')
             .order_by('product__name'))

    resp = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    resp['Content-Disposition'] = f'attachment; filename="estoque-{agora:%Y%m%d}.csv"'
    w = csv.writer(resp, delimiter=';')  # ; abre direto no Excel em pt-BR
    fmt = lambda v: f'{v:.2f}'.replace('.', ',')

    w.writerow([f'Relatório de estoque — {agora:%d/%m/%Y %H:%M}'])
    w.writerow(['Loja', store.name])
    w.writerow([])
    w.writerow([
        'Produto', 'Marca', 'Quantidade', 'Estoque mínimo', 'Custo unitário',
        'Preço de venda', 'Total investido', 'Valor de venda',
        'Lucro previsto', 'Validade mais próxima', 'Situação',
    ])

    tot_investido = tot_potencial = Decimal('0')
    n_baixo = n_vencendo = n_vencido = 0

    for it in itens:
        qtd = it.total_quantity or 0
        minimo = it.min_quantity if it.min_quantity is not None else 0
        custo = it.cost_price or Decimal('0')
        venda = it.sale_price or Decimal('0')
        investido = custo * qtd
        potencial = venda * qtd

        tot_investido += investido
        tot_potencial += potencial

        # Validade mais próxima entre os lotes com data
        datas = [b.expiration_date for b in it.batches.all() if b.expiration_date]
        proxima = min(datas) if datas else None

        situacao = []
        if qtd == 0:
            situacao.append('Sem estoque')
            n_baixo += 1
        elif qtd <= minimo:
            situacao.append('Estoque baixo')
            n_baixo += 1
        if proxima:
            dias = (proxima - hoje).days
            if dias < 0:
                situacao.append('Vencido')
                n_vencido += 1
            elif dias <= 30:
                situacao.append(f'Vence em {dias} dias')
                n_vencendo += 1

        w.writerow([
            it.product.name if it.product else '—',
            getattr(it.product, 'brand', '') or '',
            qtd,
            minimo,
            fmt(custo),
            fmt(venda),
            fmt(investido),
            fmt(potencial),
            fmt(potencial - investido),
            proxima.strftime('%d/%m/%Y') if proxima else '',
            ' / '.join(situacao) if situacao else 'OK',
        ])

    w.writerow([])
    w.writerow(['RESUMO'])
    w.writerow(['Produtos cadastrados', itens.count()])
    w.writerow(['Total investido no estoque', fmt(tot_investido)])
    w.writerow(['Valor se vender tudo', fmt(tot_potencial)])
    w.writerow(['Lucro previsto', fmt(tot_potencial - tot_investido)])
    w.writerow(['Produtos acabando ou zerados', n_baixo])
    w.writerow(['Lotes vencendo em 30 dias', n_vencendo])
    w.writerow(['Lotes vencidos', n_vencido])
    w.writerow([])
    w.writerow(['Observação: "Valor se vender tudo" e "Lucro previsto" são '
                'projeções sobre o estoque parado, não dinheiro recebido.'])
    return resp

# ==========================================
# 📇 CRM DA VITRINE — leads e carrinhos
# ==========================================
# Relacionamento CONSULTORA <-> CLIENTE FINAL DELA. Diferente do
# ConsentRecord (que é CONSULTORA <-> Minha Amora).
#
# Regra de segurança que percorre todo este bloco: nas rotas AUTENTICADAS
# (listar, ver, anonimizar, excluir), a loja vem SEMPRE de `request.user`,
# nunca do `tenant_id` que o cliente manda. Se viesse do parâmetro, uma
# consultora autenticada poderia listar os leads de outra loja só trocando
# o valor na URL.
#
# Nas rotas PÚBLICAS (upsert, persistir carrinho — chamadas por visitantes
# não autenticados da vitrine), o `tenant_id` é a ÚNICA forma de saber a
# qual loja o lead pertence. Validamos que corresponde a uma loja real; o
# throttling global (100/h por IP anônimo, em settings.py) cobre o abuso
# básico de um visitante mandando muitos pedidos.

def _store_by_tenant_id(tenant_id):
    """Resolve a Store a partir do tenant_id que a vitrine usa (= ID do dono)."""
    if not tenant_id:
        return None
    try:
        return Store.objects.get(owner_id=int(tenant_id))
    except (Store.DoesNotExist, ValueError, TypeError):
        return None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def crm_leads_list(request):
    """GET /api/crm/leads — leads da loja de quem está logado."""
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    leads = Lead.objects.filter(store=store).order_by('-last_seen')
    return Response(LeadSerializer(leads, many=True).data)


@api_view(['GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def crm_lead_detail(request, lead_id):
    """
    GET    /api/crm/leads/<id> — um lead específico, só da própria loja.
           Inclui o histórico de compras: cada pedido fechado (checked_out),
           com os produtos, quantidade, preço e data. É o que dá pra
           consultora ver "o que ela comprou, quando, por quanto" — sem
           isso o Lead sozinho só mostra nome e telefone.
    DELETE /api/crm/leads/<id> — exclusão definitiva, só da própria loja.
    Os dois métodos compartilham a mesma URL (é assim que lib/leads.ts chama).
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    lead = Lead.objects.filter(store=store, id=lead_id).first()
    if not lead:
        return Response({'error': 'Lead não encontrado'}, status=404)

    if request.method == 'DELETE':
        lead.delete()
        return Response(status=204)

    pedidos = (Cart.objects
               .filter(store=store, lead=lead, checked_out=True)
               .prefetch_related('items')
               .order_by('-updated_at'))

    historico = []
    for pedido in pedidos:
        itens = list(pedido.items.all())
        if not itens:
            continue  # carrinho fechado sem item não é um pedido de verdade
        total = sum(i.price_snapshot * i.quantity for i in itens)
        historico.append({
            'cart_id': pedido.id,
            'date': pedido.updated_at,
            'payment_method': pedido.payment_method,
            'payment_confirmed': pedido.payment_confirmed,
            'whatsapp_message': pedido.whatsapp_message,
            'items': [
                {
                    'product_name': i.product_name,
                    'quantity': i.quantity,
                    'unit_price': i.price_snapshot,
                    'subtotal': i.price_snapshot * i.quantity,
                }
                for i in itens
            ],
            'total': total,
        })

    dados = LeadSerializer(lead).data
    dados['purchase_history'] = historico
    dados['last_purchase_at'] = historico[0]['date'] if historico else None
    return Response(dados)


@api_view(['POST'])
@permission_classes([AllowAny])
def crm_lead_upsert(request):
    """
    POST /api/crm/leads/upsert — cria ou atualiza um lead pelo par
    (loja, telefone). Chamado pelo CheckoutModal na vitrine, SEM login.

    Nome e telefone são obrigatórios (é o mínimo pra consultora conseguir
    falar com a cliente). E-mail e data de nascimento são opcionais — a
    compra não pode travar por causa deles.
    """
    from datetime import date as _date
    from django.core.validators import validate_email as _validate_email
    from django.core.exceptions import ValidationError as _DjangoValidationError

    data = request.data
    store = _store_by_tenant_id(data.get('tenant_id'))
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=404)

    name = str(data.get('name') or '').strip()
    phone = re.sub(r'\D', '', str(data.get('phone') or ''))
    if not name or not phone:
        return Response({'error': 'Nome e telefone são obrigatórios'}, status=400)
    if len(phone) < 10 or len(phone) > 13:
        return Response({'error': 'Telefone inválido'}, status=400)

    # E-mail: opcional, mas se vier tem que ser um e-mail de verdade —
    # melhor recusar aqui do que deixar lixo entrar no CRM da consultora.
    email = str(data.get('email') or '').strip() or None
    if email:
        try:
            _validate_email(email)
        except _DjangoValidationError:
            return Response({'error': 'E-mail inválido'}, status=400)

    # Data de nascimento: opcional, formato AAAA-MM-DD (o que <input type="date">
    # manda). Recusa data futura ou absurdamente antiga — sinal de erro de
    # digitação, não motivo pra travar a compra por outro campo qualquer.
    birth_date = None
    raw_birth_date = data.get('birth_date')
    if raw_birth_date:
        try:
            birth_date = _date.fromisoformat(str(raw_birth_date))
        except (TypeError, ValueError):
            return Response({'error': 'Data de nascimento inválida'}, status=400)
        hoje = _date.today()
        if birth_date > hoje:
            return Response({'error': 'Data de nascimento não pode ser no futuro'}, status=400)
        if birth_date.year < hoje.year - 120:
            return Response({'error': 'Data de nascimento inválida'}, status=400)

    from django.utils import timezone as _tz
    lead, _created = Lead.objects.update_or_create(
        store=store, phone=phone,
        defaults={
            'name': name[:200],
            'email': email,
            'birth_date': birth_date,
            'whatsapp_opt_in': bool(data.get('whatsapp_opt_in')),
            'source': data.get('source') or 'storefront',
            'consent_version': data.get('consent_version'),
            'consent_timestamp': _tz.now(),
        },
    )
    return Response(LeadSerializer(lead).data, status=201 if _created else 200)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def crm_lead_anonymize(request, lead_id):
    """
    POST /api/crm/leads/<id>/anonymize — direito ao esquecimento (LGPD).
    Substitui os dados identificáveis por placeholders; preserva as
    métricas agregadas (total_orders/total_spent) para as estatísticas da
    consultora não ficarem com buraco.
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    lead = Lead.objects.filter(store=store, id=lead_id).first()
    if not lead:
        return Response({'error': 'Lead não encontrado'}, status=404)

    from django.utils import timezone as _tz
    lead.name = 'Cliente anonimizado'
    lead.phone = f'anon-{lead.id}'
    lead.email = None
    lead.whatsapp_opt_in = False
    lead.anonymized_at = _tz.now()
    lead.save(update_fields=['name', 'phone', 'email', 'whatsapp_opt_in', 'anonymized_at'])
    return Response(status=204)



@api_view(['POST'])
@permission_classes([AllowAny])
def crm_cart_persist(request):
    """
    POST /api/crm/carts/persist — salva o carrinho da vitrine vinculado ao
    lead. Chamado sem login, de duas formas:

      1. A cada mudança na sacola (checked_out=False) — é o que alimenta a
         detecção de CARRINHO ABANDONADO. Antes, isto só era chamado uma vez,
         no fechamento do pedido, então nunca existia registro de quem
         desistiu no meio do caminho.
      2. No fechamento do pedido (checked_out=True).

    ⚠️ IDEMPOTENTE por (loja, sessão): enquanto o carrinho está aberto
    (checked_out=False), a MESMA sessão sempre atualiza a MESMA linha —
    sem isso, cada tecla digitada ou clique de +/- criaria um carrinho novo
    no banco. Depois que fecha (checked_out=True), um pedido novo na mesma
    sessão abre uma linha nova (fica registrado como um segundo pedido).
    """
    data = request.data
    store = _store_by_tenant_id(data.get('tenant_id'))
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=404)

    session_id = str(data.get('session_id') or '')[:100]
    if not session_id:
        return Response({'error': 'session_id é obrigatório'}, status=400)

    lead = None
    lead_id = data.get('lead_id')
    if lead_id:
        # O lead precisa pertencer à MESMA loja do tenant_id informado —
        # senão um carrinho poderia ser amarrado ao cliente de outra loja.
        lead = Lead.objects.filter(store=store, id=lead_id).first()

    items = data.get('items') or []
    if not isinstance(items, list):
        return Response({'error': 'items deve ser uma lista'}, status=400)

    checked_out = bool(data.get('checked_out'))

    # 💳 Forma de pagamento que ela escolheu na vitrine (o que ela declarou,
    # não uma confirmação — só a consultora confirma isso, manualmente).
    payment_method = data.get('payment_method')
    if payment_method not in ('pix', 'cartao'):
        payment_method = None

    # 📝 A mensagem exata que foi montada e mandada pro WhatsApp — registro
    # do que a cliente "enviou", já que não há integração com a API do
    # WhatsApp pra confirmar entrega ou leitura.
    whatsapp_message = str(data.get('whatsapp_message') or '')[:4000] or None

    # Reaproveita o carrinho ABERTO desta sessão, se existir. Um carrinho já
    # fechado não é reaberto — uma sacola nova na mesma sessão vira um
    # carrinho novo (é um segundo pedido, não uma edição do primeiro).
    cart = Cart.objects.filter(store=store, session_id=session_id, checked_out=False).first()
    if cart:
        if lead and not cart.lead_id:
            cart.lead = lead  # sessão que ganhou identidade (fez o checkout) depois de já ter itens
        cart.checked_out = checked_out
        if payment_method:
            cart.payment_method = payment_method
        if whatsapp_message:
            cart.whatsapp_message = whatsapp_message
        cart.save(update_fields=['lead', 'checked_out', 'payment_method', 'whatsapp_message', 'updated_at'])
        cart.items.all().delete()  # substitui pela sacola atual — é sempre o estado mais recente
    else:
        cart = Cart.objects.create(
            store=store, session_id=session_id, lead=lead, checked_out=checked_out,
            payment_method=payment_method, whatsapp_message=whatsapp_message,
        )

    for it in items[:100]:  # limite defensivo: um carrinho não tem centenas de itens
        try:
            CartItem.objects.create(
                cart=cart,
                inventory_id=str(it.get('inventory_id', ''))[:50],
                product_name=str(it.get('product_name', ''))[:255],
                quantity=max(1, int(it.get('quantity', 1))),
                price_snapshot=Decimal(str(it.get('price_snapshot', 0) or 0)),
            )
        except (TypeError, ValueError, InvalidOperation):
            continue  # item malformado não derruba o carrinho inteiro

    # Pedido fechado: soma nas métricas agregadas do lead.
    if checked_out and cart.lead_id:
        total = sum((i.price_snapshot * i.quantity) for i in cart.items.all())
        Lead.objects.filter(id=cart.lead_id).update(
            total_orders=models.F('total_orders') + 1,
            total_spent=models.F('total_spent') + total,
        )

    return Response({'id': cart.id}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def crm_notifications(request):
    """
    GET /api/crm/notifications — os três avisos do CRM pro sino de
    notificações da consultora:

      • novos_leads       — clientes capturados nos últimos 3 dias
      • aniversarios       — clientes que fazem aniversário nos próximos 7 dias
      • carrinhos_abandonados — sacola parada há mais de 2h, sem fechar
        pedido, com uma cliente identificada (senão não tem pra quem
        mandar mensagem)
    """
    from datetime import timedelta, date as _date
    from django.utils import timezone as _tz

    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    agora = _tz.now()

    # ── Novos leads ──
    novos = (Lead.objects
             .filter(store=store, created_at__gte=agora - timedelta(days=3), anonymized_at__isnull=True)
             .order_by('-created_at')[:20])
    novos_leads = [{'id': l.id, 'name': l.name, 'created_at': l.created_at} for l in novos]

    # ── Aniversários nos próximos 7 dias ──
    # Comparação por mês/dia (não por data completa) — e cobre a virada do
    # ano: se hoje é 28/dez e o aniversário é 3/jan, os 7 dias à frente
    # cruzam dezembro pra janeiro.
    hoje = agora.date()
    proximos_dias = [(hoje + timedelta(days=i)) for i in range(8)]
    pares_mes_dia = {(d.month, d.day) for d in proximos_dias}
    aniversariantes = []
    for lead in Lead.objects.filter(store=store, birth_date__isnull=False, anonymized_at__isnull=True):
        if (lead.birth_date.month, lead.birth_date.day) in pares_mes_dia:
            # Próxima ocorrência do aniversário, pra ordenar por "quão perto".
            prox = lead.birth_date.replace(year=hoje.year)
            if prox < hoje:
                prox = lead.birth_date.replace(year=hoje.year + 1)
            aniversariantes.append({'id': lead.id, 'name': lead.name, 'date': prox})
    aniversariantes.sort(key=lambda x: x['date'])

    # ── Carrinhos abandonados ──
    limite = agora - timedelta(hours=2)
    carrinhos = (Cart.objects
                 .filter(store=store, checked_out=False, updated_at__lt=limite, lead__isnull=False)
                 .exclude(lead__anonymized_at__isnull=False)
                 .select_related('lead')
                 .prefetch_related('items')
                 .order_by('-updated_at')[:20])
    carrinhos_abandonados = []
    for c in carrinhos:
        itens = list(c.items.all())
        if not itens:
            continue  # sacola vazia não é "abandono", é só uma sessão que passou por aqui
        carrinhos_abandonados.append({
            'cart_id': c.id,
            'lead_id': c.lead_id,
            'lead_name': c.lead.name,
            'items': [i.product_name for i in itens],
            'updated_at': c.updated_at,
        })

    return Response({
        'novos_leads': novos_leads,
        'aniversarios': aniversariantes,
        'carrinhos_abandonados': carrinhos_abandonados,
    })

@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def crm_cart_update(request, cart_id):
    """
    PATCH  /api/crm/carts/<id> — a consultora confirma (ou corrige) o
           pagamento de um pedido. Não existe integração com o WhatsApp nem
           com meio de pagamento nenhum ainda, então isso é sempre uma
           marcação MANUAL dela — ela é quem sabe se o PIX caiu ou o cartão
           passou.
    DELETE /api/crm/carts/<id> — remove um pedido que nunca foi pago (ex.:
           cliente mandou mensagem e sumiu). Some só o pedido, o cliente
           (Lead) continua no CRM.
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response({'error': 'Loja não encontrada'}, status=400)

    cart = Cart.objects.filter(store=store, id=cart_id).first()
    if not cart:
        return Response({'error': 'Pedido não encontrado'}, status=404)

    if request.method == 'DELETE':
        # ⚠️ CORREÇÃO: total_orders/total_spent do Lead são somados no
        # checkout (crm_cart_persist), mas excluir o pedido aqui nunca
        # descontava — os números ficavam "presos" no valor antigo pra
        # sempre, mesmo depois de excluir todos os pedidos da cliente.
        if cart.checked_out and cart.lead_id:
            total_pedido = sum(i.price_snapshot * i.quantity for i in cart.items.all())
            lead = Lead.objects.filter(id=cart.lead_id).first()
            if lead:
                lead.total_orders = max(0, lead.total_orders - 1)
                lead.total_spent = max(Decimal('0'), lead.total_spent - total_pedido)
                lead.save(update_fields=['total_orders', 'total_spent'])
        cart.delete()
        return Response(status=204)

    data = request.data
    campos = []
    if 'payment_confirmed' in data:
        cart.payment_confirmed = bool(data['payment_confirmed'])
        campos.append('payment_confirmed')
    if 'payment_method' in data and data['payment_method'] in ('pix', 'cartao'):
        cart.payment_method = data['payment_method']
        campos.append('payment_method')

    if not campos:
        return Response({'error': 'Nada para atualizar'}, status=400)

    cart.save(update_fields=campos)
    return Response({
        'cart_id': cart.id,
        'payment_method': cart.payment_method,
        'payment_confirmed': cart.payment_confirmed,
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def register_promotion_view(request, promotion_id):
    """
    POST /api/promotions/<id>/view/ — a loja de quem está logado viu esta
    promoção agora. Chamado pelo PromotionBanner quando ele efetivamente
    mostra uma promoção na tela.

    Idempotente por (promoção, loja): repetir a chamada na mesma sessão não
    infla a contagem — é o que torna "Visualizações" e "Taxa de Conversão"
    do admin-panel um número real, em vez de aleatório.
    """
    store = ensure_user_has_store(request.user)
    if not store:
        return Response(status=204)  # sem loja, não há o que registrar — não é erro do cliente

    promo = Promotion.objects.filter(id=promotion_id).first()
    if not promo:
        return Response(status=204)

    PromotionView.objects.get_or_create(promotion=promo, store=store)
    return Response(status=204)


@api_view(['GET'])
@permission_classes([AllowAny])
def system_config_view(request):
    """
    GET /api/system-config/ — status de manutenção e feature flags globais,
    do jeito que QUALQUER consultora (ou a tela de login, antes mesmo de
    autenticar) precisa ver. Público de propósito: se o sistema está em
    manutenção, isso precisa aparecer mesmo pra quem ainda não conseguiu
    logar.
    """
    cfg = SystemConfig.get_solo()
    return Response({
        'maintenance_mode': cfg.maintenance_mode,
        'maintenance_message': cfg.maintenance_message if cfg.maintenance_mode else '',
        'ai_enabled': cfg.ai_enabled,
        'storefront_enabled': cfg.storefront_enabled,
        'ocr_enabled': cfg.ocr_enabled,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check_view(request):
    """
    GET /api/health/ — checagem real de infraestrutura, pro card
    "Saúde do Sistema" do admin-panel. Antes: "Banco de Dados" só repetia o
    resultado da própria API (nunca testava o banco de verdade), e
    "Gateway Pagamento" estava sempre fixo em "operational", sem checar
    nada. Latência era texto fixo ("~80ms"), não medida.
    """
    import time
    from django.db import connection

    resultado = {'api_status': 'operational'}

    # Banco: consulta real, cronometrada — não um espelho do status da API.
    inicio_db = time.monotonic()
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        resultado['database_status'] = 'operational'
    except Exception:
        resultado['database_status'] = 'down'
    resultado['database_latency_ms'] = round((time.monotonic() - inicio_db) * 1000, 1)

    # Asaas: chamada real à API deles, reaproveitando o mesmo client já
    # usado no teste de conexão do admin (apps/payments).
    inicio_asaas = time.monotonic()
    try:
        from apps.payments.services.asaas_service import asaas_service
        asaas_service._request('GET', 'finance/balance')
        resultado['payment_gateway_status'] = 'operational'
    except Exception:
        resultado['payment_gateway_status'] = 'down'
    resultado['payment_gateway_latency_ms'] = round((time.monotonic() - inicio_asaas) * 1000, 1)

    resultado['last_check'] = timezone.now().isoformat()
    return Response(resultado)

# ⚠️ api_ping_view foi movida pra inventory/api_comercial_views.py — junto
# com os outros endpoints de /api/v1/ (products, lookup, storefront), pra
# não ter dois arquivos diferentes definindo pedaços da mesma superfície
# comercial. Ver api_comercial_urls.py.