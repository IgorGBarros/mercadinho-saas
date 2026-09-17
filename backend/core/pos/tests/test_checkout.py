"""
Checkout do totem: idempotência, FIFO e trava de idade.

    python manage.py test pos
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from inventory.models import (InventoryBatch, InventoryItem,
                              ProcessedPaymentEvent, Product, Sale,
                              StockTransaction, Store)
from pos.models import Checkout, UnlockLog
from pos.services.checkout import (ErroDeCheckout, abrir_checkout,
                                   confirmar_pagamento)
from tenancy.models import Device, Operator


def montar_loja(*, estoque=10, preco='5.00', custo='3.00', restrito=False):
    operador = Operator.objects.create(name='Op Teste')
    unidade = Store.objects.create(operator=operador, name='Unidade', slug='u1')
    device = Device.objects.create(unit=unidade, kind=Device.Kind.TOTEM, serial='TOTEM-1')
    produto = Product.objects.create(
        name='Refrigerante 2L', bar_code='7894900011517', ncm='22021000',
        is_age_restricted=restrito,
    )
    item = InventoryItem.objects.create(
        store=unidade, product=produto, total_quantity=estoque,
        sale_price=Decimal(preco), cost_price=Decimal(custo),
    )
    InventoryBatch.objects.create(
        item=item, quantity=estoque, expiration_date=date.today() + timedelta(days=30)
    )
    return unidade, device, produto, item


class AberturaDeCheckout(TestCase):
    def setUp(self):
        self.unidade, self.device, self.produto, self.item = montar_loja()

    def test_abre_sem_baixar_estoque(self):
        """
        Reservar mercadoria para quem talvez nunca pague tiraria produto
        de prateleira até expirar.
        """
        c = abrir_checkout(unit=self.unidade, device=self.device,
                           itens=[{'product_id': self.produto.id, 'quantity': 2}])
        self.item.refresh_from_db()
        self.assertEqual(c.status, Checkout.Status.AGUARDANDO)
        self.assertEqual(c.total, Decimal('10.00'))
        self.assertEqual(self.item.total_quantity, 10)

    def test_mesma_chave_devolve_o_mesmo_checkout(self):
        """
        Rede caiu depois do POST e antes da resposta: o totem repete a
        chamada. Sem isto, o cliente veria dois QR Codes para uma compra.
        """
        itens = [{'product_id': self.produto.id, 'quantity': 1}]
        a = abrir_checkout(unit=self.unidade, itens=itens, idempotency_key='abc123')
        b = abrir_checkout(unit=self.unidade, itens=itens, idempotency_key='abc123')
        self.assertEqual(a.id, b.id)
        self.assertEqual(Checkout.objects.count(), 1)

    def test_carrinho_vazio_e_recusado(self):
        with self.assertRaises(ErroDeCheckout):
            abrir_checkout(unit=self.unidade, itens=[])

    def test_item_de_balanca_multiplica_pelo_peso(self):
        granel = Product.objects.create(name='Picanha', requires_scale=True, scale_plu=1234)
        inv = InventoryItem.objects.create(
            store=self.unidade, product=granel, total_quantity=5,
            sale_price=Decimal('80.00'), cost_price=Decimal('50.00'),
        )
        InventoryBatch.objects.create(item=inv, quantity=5)

        c = abrir_checkout(unit=self.unidade, itens=[
            {'product_id': granel.id, 'quantity': 1, 'weight_kg': Decimal('1.250')}
        ])
        self.assertEqual(c.total, Decimal('100.00'))  # 80,00/kg × 1,250 kg


class TravaDeIdade(TestCase):
    def test_bebida_alcoolica_exige_verificacao(self):
        unidade, device, produto, _ = montar_loja(restrito=True)
        with self.assertRaises(ErroDeCheckout) as ctx:
            abrir_checkout(unit=unidade, itens=[{'product_id': produto.id, 'quantity': 1}])
        self.assertIn('idade', str(ctx.exception))

    def test_com_idade_verificada_passa(self):
        unidade, device, produto, _ = montar_loja(restrito=True)
        c = abrir_checkout(unit=unidade, idade_verificada=True,
                           itens=[{'product_id': produto.id, 'quantity': 1}])
        self.assertEqual(c.status, Checkout.Status.AGUARDANDO)


class ConfirmacaoDePagamento(TestCase):
    def setUp(self):
        self.unidade, self.device, self.produto, self.item = montar_loja(estoque=10)
        self.checkout = abrir_checkout(
            unit=self.unidade, device=self.device,
            itens=[{'product_id': self.produto.id, 'quantity': 3}],
        )

    def test_pagamento_baixa_estoque_e_cria_venda(self):
        c = confirmar_pagamento(payment_id='pay_001', checkout=self.checkout)
        self.item.refresh_from_db()

        self.assertEqual(c.status, Checkout.Status.PAGO)
        self.assertEqual(self.item.total_quantity, 7)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(c.sale.total_amount, Decimal('15.00'))

    def test_gera_extrato_de_movimentacao(self):
        confirmar_pagamento(payment_id='pay_002', checkout=self.checkout)
        mov = StockTransaction.objects.filter(transaction_type='VENDA')
        self.assertEqual(sum(m.quantity for m in mov), -3)

    def test_congela_o_custo_do_momento(self):
        """Margem histórica correta mesmo depois de o fornecedor reajustar."""
        c = confirmar_pagamento(payment_id='pay_003', checkout=self.checkout)
        self.item.cost_price = Decimal('99.00')
        self.item.save()
        self.assertEqual(c.sale.items.first().unit_cost_at_time, Decimal('3.00'))

    def test_registra_a_abertura_da_trava(self):
        c = confirmar_pagamento(payment_id='pay_004', checkout=self.checkout)
        log = UnlockLog.objects.get(checkout=c)
        self.assertEqual(log.motivo, UnlockLog.Motivo.VENDA)

    def test_estoque_insuficiente_nao_deixa_venda_pela_metade(self):
        self.item.batches.all().delete()
        InventoryBatch.objects.create(item=self.item, quantity=1)

        with self.assertRaises(ErroDeCheckout):
            confirmar_pagamento(payment_id='pay_005', checkout=self.checkout)

        # A transação inteira voltou atrás.
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(StockTransaction.objects.count(), 0)

    def test_pagamento_depois_da_janela_e_recusado(self):
        self.checkout.expires_at = timezone.now() - timedelta(minutes=1)
        self.checkout.save(update_fields=['expires_at'])

        with self.assertRaises(ErroDeCheckout):
            confirmar_pagamento(payment_id='pay_006', checkout=self.checkout)

        self.checkout.refresh_from_db()
        self.assertEqual(self.checkout.status, Checkout.Status.EXPIRADO)


class ReentregaDeWebhook(TestCase):
    """
    Provedor de PIX entrega "at least once". Sem idempotência, uma
    reentrega baixa o estoque de novo e destrava a geladeira de novo.
    """

    def setUp(self):
        self.unidade, self.device, self.produto, self.item = montar_loja(estoque=10)
        self.checkout = abrir_checkout(
            unit=self.unidade, device=self.device,
            itens=[{'product_id': self.produto.id, 'quantity': 2}],
        )

    def test_webhook_repetido_nao_baixa_estoque_duas_vezes(self):
        confirmar_pagamento(payment_id='pay_dup', checkout=self.checkout)
        confirmar_pagamento(payment_id='pay_dup', checkout=self.checkout)
        confirmar_pagamento(payment_id='pay_dup', checkout=self.checkout)

        self.item.refresh_from_db()
        self.assertEqual(self.item.total_quantity, 8, 'só uma baixa deveria valer')
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(UnlockLog.objects.count(), 1, 'não pode destravar duas vezes')
        self.assertEqual(ProcessedPaymentEvent.objects.filter(payment_id='pay_dup').count(), 1)

    def test_payment_id_diferente_no_mesmo_checkout_nao_duplica(self):
        """Segunda barreira: o status PAGO já impede o reprocessamento."""
        confirmar_pagamento(payment_id='pay_a', checkout=self.checkout)
        confirmar_pagamento(payment_id='pay_b', checkout=self.checkout)

        self.item.refresh_from_db()
        self.assertEqual(self.item.total_quantity, 8)
        self.assertEqual(Sale.objects.count(), 1)


class OrdemFifo(TestCase):
    def setUp(self):
        self.unidade, self.device, self.produto, self.item = montar_loja(estoque=0)
        self.item.batches.all().delete()

    def _lote(self, qtd, dias=None):
        return InventoryBatch.objects.create(
            item=self.item, quantity=qtd,
            expiration_date=(date.today() + timedelta(days=dias)) if dias else None,
        )

    def test_consome_o_que_vence_primeiro(self):
        perto = self._lote(5, dias=3)
        longe = self._lote(5, dias=90)
        self.item.total_quantity = 10
        self.item.save()

        c = abrir_checkout(unit=self.unidade,
                           itens=[{'product_id': self.produto.id, 'quantity': 4}])
        confirmar_pagamento(payment_id='pay_fifo', checkout=c)

        perto.refresh_from_db()
        longe.refresh_from_db()
        self.assertEqual(perto.quantity, 1)
        self.assertEqual(longe.quantity, 5)

    def test_lote_sem_validade_fica_por_ultimo(self):
        """
        NULLS LAST. Ordenação ingênua colocaria o lote sem validade em
        primeiro no Postgres — e aí o produto que vence amanhã estraga
        na prateleira.
        """
        sem_validade = self._lote(5)
        com_validade = self._lote(5, dias=7)
        self.item.total_quantity = 10
        self.item.save()

        c = abrir_checkout(unit=self.unidade,
                           itens=[{'product_id': self.produto.id, 'quantity': 5}])
        confirmar_pagamento(payment_id='pay_null', checkout=c)

        sem_validade.refresh_from_db()
        com_validade.refresh_from_db()
        self.assertEqual(com_validade.quantity, 0, 'o que vence deveria sair primeiro')
        self.assertEqual(sem_validade.quantity, 5)

    def test_atravessa_varios_lotes(self):
        self._lote(2, dias=1)
        self._lote(2, dias=2)
        self._lote(2, dias=3)
        self.item.total_quantity = 6
        self.item.save()

        c = abrir_checkout(unit=self.unidade,
                           itens=[{'product_id': self.produto.id, 'quantity': 5}])
        confirmar_pagamento(payment_id='pay_multi', checkout=c)

        self.item.refresh_from_db()
        self.assertEqual(self.item.total_quantity, 1)
        self.assertEqual(self.item.batches.filter(quantity__gt=0).count(), 1)
