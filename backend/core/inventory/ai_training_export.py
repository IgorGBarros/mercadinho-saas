# backend/core/inventory/ai_training_export.py
"""
Camada de exportação de dados para treinamento de modelos de IA.

Regras que este módulo aplica sempre, sem exceção — qualquer pipeline de
treino futuro deve buscar dados por AQUI, nunca direto em Sale/StockTransaction:

1. Só inclui dados de lojas cujo dono tem consentimento ATIVO para a
   finalidade 'ai_training' (LGPD art. 8º). Essa finalidade é distinta de
   'ai_features' (usar o assistente Amorinha dentro do app) — são
   consentimentos para coisas diferentes, e misturá-los tornaria o
   consentimento genérico demais para ser válido (art. 8º, §4º).

2. Nunca inclui campos de texto livre que podem carregar dados pessoais
   de terceiros — o cliente da consultora, não a consultora em si.
   `Sale.client_name` e `Sale.notes` ficam de fora por princípio de
   minimização (art. 6º, III), independentemente do consentimento: não
   são necessários pra nenhum objetivo de treino (padrão de estoque/venda)
   e não devem ser coletados só porque estão disponíveis.

Se um dia for necessário abrir uma exceção a alguma dessas regras, o
correto é editar aqui — e não fazer uma query direta em outro lugar do
código que ignore o filtro.
"""
from .consent_utils import consented_user_ids
from .models import Sale, StockTransaction

AI_TRAINING_PURPOSE = "ai_training"

# Colunas conscientemente seguras para exportar. `description` (StockTransaction)
# e `client_name` / `notes` (Sale) ficam de fora deliberadamente — são campos de
# texto livre que podem conter nome ou outros dados do cliente da consultora.
STOCK_TRANSACTION_FIELDS = [
    "transaction_type", "quantity", "unit_cost", "unit_price",
    "product__name", "product__category", "product__brand", "created_at",
]
SALE_FIELDS = [
    "transaction_type", "total_amount", "payment_method", "created_at",
]


def get_training_stock_transactions():
    """QuerySet de StockTransaction pronto para treino: só lojas com
    consentimento ativo, só colunas sem risco de PII de terceiros."""
    owner_ids = consented_user_ids(AI_TRAINING_PURPOSE)
    return (
        StockTransaction.objects
        .filter(store__owner_id__in=owner_ids)
        .values(*STOCK_TRANSACTION_FIELDS)
    )


def get_training_sales():
    """QuerySet de Sale pronto para treino: só lojas com consentimento
    ativo, sem client_name/notes."""
    owner_ids = consented_user_ids(AI_TRAINING_PURPOSE)
    return (
        Sale.objects
        .filter(store__owner_id__in=owner_ids)
        .values(*SALE_FIELDS)
    )


def training_dataset_summary() -> dict:
    """
    Visão rápida de tamanho/cobertura do dataset — útil para checar antes
    de rodar um treino, e para alimentar `MLInsight.training_data_size` de
    forma honesta (hoje esse campo existe no modelo, mas nada no sistema
    ainda o preenche, porque não existe um job de treino real rodando).
    """
    owner_ids = consented_user_ids(AI_TRAINING_PURPOSE)
    return {
        "consented_stores": len(owner_ids),
        "stock_transactions": get_training_stock_transactions().count(),
        "sales": get_training_sales().count(),
    }