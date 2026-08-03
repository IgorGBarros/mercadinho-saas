# backend/core/inventory/utils.py
"""
Resolução de tenant — PONTO ÚNICO DE VERDADE.

⚠️ LEIA ANTES DE EDITAR
Existiam duas implementações concorrentes de `get_current_store` e
`ensure_user_has_store`: uma aqui e outra definida direto em views.py.
Como a definição local de views.py vinha DEPOIS do `from .utils import ...`,
ela sobrescrevia o nome importado — na prática, quase todo o views.py usava
a versão local e este arquivo era ignorado. Quem editasse aqui não via
efeito nenhum. As definições locais foram removidas; este arquivo voltou a
ser o único lugar onde a resolução de tenant acontece.

⚠️ MUDANÇA DE COMPORTAMENTO DELIBERADA
A versão antiga CRIAVA uma loja quando o usuário não tinha nenhuma. Num
SaaS de auto-cadastro isso é conveniente; num sistema B2B multi-cliente é
falha de isolamento — um usuário sem permissão ganhava um tenant novo em
vez de tomar 403. Agora: sem vínculo, sem acesso.
"""
import logging

from django.core.exceptions import ValidationError
from django.utils.text import slugify
from rest_framework.exceptions import NotFound, PermissionDenied

from .models import Store

logger = logging.getLogger(__name__)

# Header que o frontend envia quando o usuário troca de unidade no seletor.
UNIT_HEADER = 'X-Unit-Id'


def get_membership(user):
    """
    Vínculo ativo do usuário. Não cria nada.

    Raises:
        PermissionDenied: usuário sem vínculo ativo com nenhuma operação.
    """
    from tenancy.models import Membership

    if not user or not user.is_authenticated:
        raise PermissionDenied("Autenticação obrigatória.")

    vinculo = (
        Membership.objects
        .filter(user=user, is_active=True, operator__is_active=True)
        .select_related('operator')
        .first()
    )
    if not vinculo:
        logger.warning("Usuário %s sem vínculo ativo — acesso negado.", user.pk)
        raise PermissionDenied("Usuário sem vínculo com nenhuma operação.")
    return vinculo


def allowed_units(user):
    """Queryset das unidades que este usuário pode enxergar."""
    return get_membership(user).allowed_units()


def resolve_unit(request):
    """
    A unidade ativa desta requisição.

    Origem: header X-Unit-Id. Sem header, cai na primeira unidade permitida
    — que cobre o caso mais comum (cliente com uma unidade só) e mantém a
    UX idêntica à de hoje.
    """
    permitidas = allowed_units(request.user)
    unit_id = request.headers.get(UNIT_HEADER)

    if unit_id:
        unidade = permitidas.filter(pk=unit_id).first()
        if not unidade:
            # 404 e não 403: negar com "acesso negado" confirmaria que a
            # unidade existe. Para quem sonda IDs alheios, ela não existe.
            raise NotFound("Unidade não encontrada.")
        return unidade

    unidade = permitidas.order_by('id').first()
    if not unidade:
        raise PermissionDenied("Nenhuma unidade disponível para este usuário.")
    return unidade


def get_current_store(user):
    """
    ⚠️ DEPRECIADO — use resolve_unit(request).

    Mantido porque 32 pontos de views.py ainda chamam pelo nome antigo.
    Devolve a primeira unidade permitida, ignorando o header de seleção:
    a unidade ativa é uma propriedade da REQUISIÇÃO, não do usuário, e não
    dá para descobri-la só com `user`.
    """
    return allowed_units(user).order_by('id').first()


def ensure_user_has_store(user):
    """⚠️ DEPRECIADO — use resolve_unit(request). Ver get_current_store."""
    unidade = get_current_store(user)
    if not unidade:
        raise PermissionDenied("Nenhuma unidade disponível para este usuário.")
    return unidade


def user_can_access_unit(user, unit) -> bool:
    """Checagem pontual, para código que já tem a unidade em mãos."""
    if not unit:
        return False
    return allowed_units(user).filter(pk=unit.pk).exists()


def validate_store_ownership(user, store):
    """
    Valida se o usuário é dono da loja (segurança tenant).
    
    Args:
        user: Instância do modelo User
        store: Instância do modelo Store
        
    Returns:
        bool: True se o usuário é dono da loja
        
    Raises:
        ValidationError: Se o usuário não é dono da loja
    """
    if not store or not user:
        raise ValidationError("Usuário e loja são obrigatórios")
    
    if store.owner_id != user.id:
        logger.warning(
            f"Tentativa de acesso não autorizado: usuário {user.id} "
            f"tentou acessar loja {store.id}"
        )
        raise ValidationError("Acesso negado: você não é dono desta loja")
    
    return True


def get_store_stats(store):
    """
    Retorna estatísticas básicas da loja.
    
    Args:
        store: Instância do modelo Store
        
    Returns:
        dict: Estatísticas da loja
    """
    try:
        # Import local para evitar circular
        from .models import InventoryItem
        
        total_products = store.items.count()
        total_value = sum(
            (item.cost_price or 0) * item.total_quantity 
            for item in store.items.all()
        )
        
        return {
            'total_products': total_products,
            'total_value': total_value,
            'plan': store.plan,
            'can_add_products': getattr(store, 'can_add_products', True),
            'created_at': store.created_at,
        }
        
    except Exception as e:
        logger.error(f"Erro ao calcular estatísticas da loja {store.id}: {e}")
        # Retornar valores padrão seguros em caso de erro
        return {
            'total_products': 0,
            'total_value': 0,
            'plan': getattr(store, 'plan', 'free'),
            'can_add_products': True,
            'created_at': getattr(store, 'created_at', None),
        }


# ==========================================
# UTILITÁRIOS ADICIONAIS (OPCIONAIS)
# ==========================================

def format_store_slug(name: str, user_id: int = None) -> str:
    """
    Gera um slug único e seguro para uma loja.
    
    Args:
        name: Nome base para o slug
        user_id: ID do usuário para garantir unicidade (opcional)
        
    Returns:
        str: Slug único e URL-safe
    """
    base_slug = slugify(name)
    if not base_slug:
        base_slug = f"loja-{user_id}" if user_id else "minha-loja"
    
    # Verificar unicidade
    unique_slug = base_slug
    counter = 1
    while Store.objects.filter(slug=unique_slug).exists():
        unique_slug = f"{base_slug}-{counter}"
        counter += 1
        if counter > 100:  # Limite de segurança
            unique_slug = f"{base_slug}-{user_id or 'x'}"
            break
    
    return unique_slug


def get_user_store_or_none(user):
    """
    Obtém a loja do usuário sem criar automaticamente.
    
    Útil para verificações onde não queremos criar loja silenciosamente.
    
    Args:
        user: Instância do modelo User
        
    Returns:
        Store or None: Loja do usuário ou None se não existir
    """
    if not user or not user.is_authenticated:
        return None
    
    try:
        # Tentar via relacionamento
        if hasattr(user, 'store') and user.store:
            return user.store
        # Fallback via query
        return Store.objects.filter(owner=user).first()
    except Exception:
        return None


def bulk_create_stores_for_users(user_ids: list, plan: str = 'free') -> dict:
    """
    Cria lojas em massa para múltiplos usuários (admin/seed).
    
    Args:
        user_ids: Lista de IDs de usuários
        plan: Plano padrão para as lojas criadas
        
    Returns:
        dict: Resumo da operação {created: int, skipped: int, errors: list}
    """
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    result = {'created': 0, 'skipped': 0, 'errors': []}
    
    for user_id in user_ids:
        try:
            user = User.objects.get(id=user_id)
            
            # Pular se já tem loja
            if get_user_store_or_none(user):
                result['skipped'] += 1
                continue
            
            # Criar loja
            store = get_current_store(user)
            if plan != 'free':
                store.plan = plan
                store.save(update_fields=['plan'])
            
            result['created'] += 1
            
        except Exception as e:
            result['errors'].append({
                'user_id': user_id,
                'error': str(e)
            })
            logger.error(f"Erro ao criar loja para usuário {user_id}: {e}")
    
    return result