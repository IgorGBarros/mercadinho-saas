"""
pos/services/checkout.py — abertura e confirmação de venda no totem.

⚠️ ESTE É O ARQUIVO ONDE CORRIDA DE CONCORRÊNCIA CUSTA DINHEIRO.
Dois cenários reais, ambos rotineiros:

  • O provedor de PIX reentrega o mesmo webhook (garantia "at least once").
    Sem idempotência: estoque baixado duas vezes e geladeira destravada
    duas vezes para uma compra só.

  • Dois clientes escaneiam o último refrigerante ao mesmo tempo, em
    totens diferentes. Sem trava de linha: os dois pagam, o estoque vai a
    -1 e alguém abre a geladeira vazia.

O `select_for_update()` abaixo resolve o segundo. Note que ele é NO-OP no
SQLite — por isso o Postgres local não é preciosismo: este bug só aparece
no banco de verdade.
"""
import logging
import uuid
from decimal import Decimal

from django.db import models, transaction
from django.db.models import Sum
from django.utils import timezone

from ..models import Checkout, CheckoutItem, UnlockLog

logger = logging.getLogger(__name__)


class ErroDeCheckout(Exception):
    """Falha de negócio — vira 400, não 500."""


def _preco_do_item(inventory_item, product, weight_kg):
    preco = inventory_item.sale_price or Decimal('0')
    if weight_kg is not None:
        return (preco * Decimal(weight_kg)).quantize(Decimal('0.01'))
    return preco


@transaction.atomic
def abrir_checkout(*, unit, device=None, itens, idempotency_key=None, idade_verificada=False):
    """
    Monta o carrinho e devolve um Checkout aguardando pagamento.

    NÃO baixa estoque. Baixar aqui significaria reservar mercadoria para
    quem talvez nunca pague — e um totem abandonado no meio da compra
    tiraria produto de prateleira até expirar.

    Args:
        itens: [{'product_id': int, 'quantity': int, 'weight_kg': Decimal|None}]
        idade_verificada: True se o totem validou a idade do comprador.
    """
    from inventory.models import InventoryItem, Product

    if not itens:
        raise ErroDeCheckout('Carrinho vazio.')

    chave = idempotency_key or uuid.uuid4().hex

    # Repetição do MESMO pedido (rede caiu antes da resposta): devolve o
    # que já existe em vez de criar um segundo QR Code.
    existente = Checkout.objects.filter(unit=unit, idempotency_key=chave).first()
    if existente:
        logger.info('Checkout %s reaproveitado (idempotência).', existente.id)
        return existente

    checkout = Checkout.objects.create(
        unit=unit, device=device, idempotency_key=chave,
        expires_at=timezone.now() + Checkout.JANELA_PAGAMENTO,
    )

    total = Decimal('0')
    for linha in itens:
        product = Product.objects.filter(pk=linha['product_id']).first()
        if not product:
            raise ErroDeCheckout(f"Produto {linha['product_id']} não existe.")

        # ⚠️ Trava de idade. Exposição legal do CLIENTE, não recurso
        # opcional: bebida alcoólica em totem desassistido sem verificação
        # é infração dele, não sua.
        if product.is_age_restricted and not idade_verificada:
            raise ErroDeCheckout(
                f'{product.name} exige verificação de idade antes da compra.'
            )

        inv = InventoryItem.objects.filter(store=unit, product=product).first()
        if not inv:
            raise ErroDeCheckout(f'{product.name} não está no estoque desta unidade.')

        qtd = int(linha.get('quantity') or 1)
        peso = linha.get('weight_kg')
        preco = _preco_do_item(inv, product, peso)
        subtotal = (preco * qtd).quantize(Decimal('0.01'))

        CheckoutItem.objects.create(
            checkout=checkout, product=product, quantity=qtd,
            weight_kg=peso, unit_price=preco, subtotal=subtotal,
            ncm_at_time=product.ncm or '',
        )
        total += subtotal

    checkout.total = total
    checkout.save(update_fields=['total'])
    return checkout


def confirmar_pagamento(*, payment_id, provider='pix', checkout=None, event=''):
    """
    Confirma a venda. Idempotente e atômico.

    Chamado pelo WEBHOOK, nunca pelo totem. Faz, numa transação só:
      1. registra o evento (a unicidade do payment_id é a idempotência)
      2. baixa FIFO com trava de linha
      3. cria Sale + SaleItem + StockTransaction
      4. libera a trava

    Se qualquer passo falhar, tudo volta atrás — não existe meia venda.
    """
    from inventory.models import (InventoryItem, ProcessedPaymentEvent, Sale,
                                  SaleItem, StockTransaction)

    if checkout is None:
        checkout = Checkout.objects.filter(payment_external_id=payment_id).first()
    if checkout is None:
        raise ErroDeCheckout(f'Nenhum checkout para o pagamento {payment_id}.')

    # ══════════════════════════════════════════════════════════════
    # FASE 1 — triagem, em transação PRÓPRIA
    #
    # ⚠️ Separada de propósito. Se a marcação de EXPIRADO ficasse na
    # mesma transação do processamento, o `raise` desfaria o próprio
    # registro de expiração — o checkout voltaria a 'aguardando' e o
    # problema se repetiria a cada reentrega do webhook.
    # ══════════════════════════════════════════════════════════════
    with transaction.atomic():
        travado = Checkout.objects.select_for_update().get(pk=checkout.pk)

        if travado.status == Checkout.Status.PAGO:
            logger.info('Pagamento %s já processado — ignorando reentrega.', payment_id)
            return travado

        if travado.expirou:
            travado.status = Checkout.Status.EXPIRADO
            travado.erro = 'Pagamento chegou depois da janela.'
            travado.save(update_fields=['status', 'erro'])
            expirado = True
        else:
            expirado = False

    if expirado:
        raise ErroDeCheckout('Checkout expirado.')

    return _processar(
        checkout=checkout, payment_id=payment_id, provider=provider, event=event
    )


@transaction.atomic
def _processar(*, checkout, payment_id, provider, event):
    """Baixa de estoque e criação da venda. Tudo ou nada."""
    from inventory.models import (InventoryItem, ProcessedPaymentEvent, Sale,
                                  SaleItem, StockTransaction)

    # 🔒 Retrava dentro da transação de escrita.
    checkout = Checkout.objects.select_for_update().get(pk=checkout.pk)
    if checkout.status == Checkout.Status.PAGO:
        return checkout

    # Barreira final: unique em payment_id. Se dois processos passarem da
    # checagem acima ao mesmo tempo, o banco recusa o segundo.
    _, novo = ProcessedPaymentEvent.objects.get_or_create(
        payment_id=payment_id,
        defaults={'store': checkout.unit, 'event': event or 'PIX_RECEIVED'},
    )
    if not novo:
        logger.info('Evento %s já registrado — reentrega ignorada.', payment_id)
        return checkout

    venda = Sale.objects.create(
        store=checkout.unit, transaction_type='VENDA',
        total_amount=checkout.total, payment_method='PIX',
        notes=f'Totem · checkout #{checkout.id}',
    )

    for item in checkout.items.select_related('product'):
        inv = (InventoryItem.objects
               .select_for_update()
               .filter(store=checkout.unit, product=item.product)
               .first())
        if not inv:
            raise ErroDeCheckout(f'{item.product.name} saiu do estoque.')

        usados = _baixar_fifo(inv, item.quantity)

        for lote_id, qtd, custo in usados:
            SaleItem.objects.create(
                sale=venda, product=item.product, batch_id=lote_id,
                quantity=qtd, unit_price_sold=item.unit_price,
                # ⚠️ Custo congelado: é o que permite calcular margem
                # histórica correta mesmo depois de o fornecedor reajustar.
                unit_cost_at_time=custo,
            )
            StockTransaction.objects.create(
                store=checkout.unit, product=item.product, batch_id=lote_id,
                transaction_type='VENDA', quantity=-qtd,
                unit_cost=custo, unit_price=item.unit_price,
                description=f'Totem · checkout #{checkout.id}',
            )

    checkout.status = Checkout.Status.PAGO
    checkout.paid_at = timezone.now()
    checkout.sale = venda
    checkout.payment_provider = provider
    checkout.payment_external_id = payment_id
    checkout.save(update_fields=['status', 'paid_at', 'sale',
                                 'payment_provider', 'payment_external_id'])

    if checkout.device:
        UnlockLog.objects.create(
            device=checkout.device, checkout=checkout, motivo=UnlockLog.Motivo.VENDA
        )

    # 🧾 Enfileira a NFC-e. Só CRIA o registro pendente — a transmissão é
    # do worker. A venda já está fechada; SEFAZ fora do ar não a desfaz.
    from fiscal.services.emissao import enfileirar
    enfileirar(venda)
    logger.info('Checkout %s pago. NFC-e enfileirada.', checkout.id)
    return checkout


def _baixar_fifo(inventory_item, quantidade):
    """
    Baixa pelo lote que vence primeiro, com trava de linha.

    ⚠️ DIFERENÇA CRÍTICA para a versão em inventory/views.py: aquela não
    usa select_for_update. Duas vendas simultâneas do último item leem o
    mesmo saldo, ambas passam na checagem e o estoque vai a negativo.
    Aqui os lotes ficam travados até a transação terminar.

    Retorna [(lote_id, quantidade, custo_unitário)].
    """
    lotes = list(
        inventory_item.batches
        .select_for_update()
        .filter(quantity__gt=0)
        # NULLS LAST: lote sem validade é o menos urgente, não o mais.
        .order_by(models.F('expiration_date').asc(nulls_last=True), 'id')
    )

    disponivel = sum(l.quantity for l in lotes)
    if disponivel < quantidade:
        raise ErroDeCheckout(
            f'Estoque insuficiente de {inventory_item.product.name}: '
            f'{disponivel} disponível, {quantidade} pedido.'
        )

    custo = inventory_item.cost_price or Decimal('0')
    restante = quantidade
    usados = []

    for lote in lotes:
        if restante <= 0:
            break
        tirar = min(restante, lote.quantity)
        lote.quantity -= tirar
        lote.save(update_fields=['quantity'])
        usados.append((lote.id, tirar, custo))
        restante -= tirar

    # ⚠️ Recalcula a partir dos lotes em vez de subtrair do total. Se algum
    # ajuste manual dessincronizou os dois, a soma dos lotes é a verdade.
    inventory_item.total_quantity = (
        inventory_item.batches.aggregate(t=Sum('quantity'))['t'] or 0
    )
    inventory_item.save(update_fields=['total_quantity'])
    return usados
