"""
Motor de reposição: velocidade, ponto de pedido e os seis alertas.

    python manage.py test replenishment
"""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from inventory.models import (InventoryBatch, InventoryItem, Product,
                              StockTransaction, Store)
from replenishment.models import Alert, PickList, ReplenishmentRule
from replenishment.services.motor import (analisar_unidade, calcular_velocidade,
                                          gerar_picklist, recalcular_regra,
                                          registrar_divergencia)
from tenancy.models import Device, Operator


def montar(estoque=10, nome='Refrigerante 2L'):
    operador = Operator.objects.create(name='Op')
    unidade = Store.objects.create(operator=operador, name='U', slug='u1')
    produto = Product.objects.create(name=nome, ncm='22021000')
    item = InventoryItem.objects.create(
        store=unidade, product=produto, total_quantity=estoque,
        sale_price=Decimal('5.00'), cost_price=Decimal('3.00'), min_quantity=5,
    )
    return unidade, produto, item


def vendas(item, *, por_dia, dias, ate_dias_atras=0):
    """Cria histórico de venda distribuído no tempo."""
    for d in range(ate_dias_atras, ate_dias_atras + dias):
        t = StockTransaction.objects.create(
            store=item.store, product=item.product,
            transaction_type='VENDA', quantity=-por_dia,
        )
        StockTransaction.objects.filter(pk=t.pk).update(
            created_at=timezone.now() - timedelta(days=d)
        )


class Velocidade(TestCase):
    def test_media_diaria_simples(self):
        _, _, item = montar()
        vendas(item, por_dia=3, dias=28)
        self.assertAlmostEqual(float(calcular_velocidade(item)), 3.0, places=1)

    def test_sem_historico_e_zero(self):
        _, _, item = montar()
        self.assertEqual(calcular_velocidade(item), Decimal('0'))

    def test_ruptura_nao_subestima_a_demanda(self):
        """
        O erro que mantém mercadinho desabastecido.

        Vendeu 4/dia durante 14 dias e depois ficou zerado 14 dias.
        Dividir por 28 daria 2/dia — metade da demanda real — e o sistema
        sugeriria comprar pouco, perpetuando a falta.
        """
        _, _, item = montar(estoque=0)
        vendas(item, por_dia=4, dias=14, ate_dias_atras=14)

        v = float(calcular_velocidade(item))
        self.assertAlmostEqual(v, 4.0, places=1)
        self.assertGreater(v, 56 / 28, 'não pode diluir pelos dias sem estoque')


class PontoDePedido(TestCase):
    def test_calcula_a_partir_da_venda_real(self):
        _, _, item = montar()
        vendas(item, por_dia=5, dias=28)
        regra = recalcular_regra(item)

        # 5/dia × 3 dias de lead time = 15, + segurança (metade) ≈ 22
        self.assertEqual(regra.lead_time_days, 3)
        self.assertGreaterEqual(regra.min_qty, 20)
        self.assertGreater(regra.max_qty, regra.min_qty)

    def test_lead_time_maior_exige_estoque_maior(self):
        _, _, item = montar()
        vendas(item, por_dia=5, dias=28)

        curto = recalcular_regra(item).min_qty
        ReplenishmentRule.objects.filter(item=item).update(lead_time_days=10)
        item.refresh_from_db()
        longo = recalcular_regra(item).min_qty

        self.assertGreater(longo, curto)

    def test_manual_nao_e_sobrescrito(self):
        """O lojista sabe de coisas que o histórico não mostra."""
        _, _, item = montar()
        vendas(item, por_dia=5, dias=28)
        ReplenishmentRule.objects.create(item=item, is_auto=False, min_qty=99, max_qty=200)

        regra = recalcular_regra(item)
        self.assertEqual(regra.min_qty, 99)

    def test_cobertura_em_dias(self):
        _, _, item = montar(estoque=20)
        vendas(item, por_dia=4, dias=28)
        regra = recalcular_regra(item)
        self.assertAlmostEqual(regra.dias_de_cobertura, 5.0, places=0)


class SeisAlertas(TestCase):
    def test_ruptura_ativa_e_urgente(self):
        unidade, _, item = montar(estoque=0)
        vendas(item, por_dia=3, dias=20, ate_dias_atras=2)

        analisar_unidade(unidade)
        a = Alert.objects.get(tipo=Alert.Tipo.RUPTURA_ATIVA)
        self.assertEqual(a.severidade, Alert.Severidade.URGENTE)

    def test_ruptura_prevista_traz_a_quantidade_a_repor(self):
        unidade, _, item = montar(estoque=2)
        vendas(item, por_dia=3, dias=28)

        analisar_unidade(unidade)
        a = Alert.objects.get(tipo=Alert.Tipo.RUPTURA_PREVISTA)
        self.assertGreater(a.dados['sugestao'], 0)

    def test_validade_critica(self):
        unidade, _, item = montar(estoque=10)
        InventoryBatch.objects.create(
            item=item, quantity=10, expiration_date=date.today() + timedelta(days=2)
        )
        analisar_unidade(unidade)
        a = Alert.objects.get(tipo=Alert.Tipo.VALIDADE)
        self.assertEqual(a.severidade, Alert.Severidade.URGENTE)

    def test_dead_stock(self):
        unidade, _, item = montar(estoque=8)
        analisar_unidade(unidade)
        self.assertTrue(Alert.objects.filter(tipo=Alert.Tipo.DEAD_STOCK).exists())

    def test_totem_offline(self):
        unidade, _, item = montar()
        Device.objects.create(unit=unidade, kind=Device.Kind.TOTEM, serial='T1')

        analisar_unidade(unidade)
        a = Alert.objects.get(tipo=Alert.Tipo.DEVICE_OFFLINE)
        self.assertEqual(a.severidade, Alert.Severidade.URGENTE)

    def test_totem_com_heartbeat_recente_nao_alerta(self):
        unidade, _, item = montar()
        d = Device.objects.create(unit=unidade, kind=Device.Kind.TOTEM, serial='T2')
        d.touch()

        analisar_unidade(unidade)
        self.assertFalse(Alert.objects.filter(tipo=Alert.Tipo.DEVICE_OFFLINE).exists())

    def test_divergencia_de_inventario(self):
        unidade, _, item = montar(estoque=20)
        a = registrar_divergencia(item, contado=17, observacao='Contagem cega de sexta')

        self.assertEqual(a.dados['diferenca'], -3)
        self.assertEqual(a.severidade, Alert.Severidade.URGENTE)

    def test_contagem_certa_nao_gera_alerta(self):
        _, _, item = montar(estoque=20)
        self.assertIsNone(registrar_divergencia(item, contado=20))


class Deduplicacao(TestCase):
    """Alerta repetido é alerta ignorado — o lojista para de olhar o sino."""

    def test_rodar_varias_vezes_nao_multiplica(self):
        unidade, _, item = montar(estoque=0)
        vendas(item, por_dia=3, dias=20, ate_dias_atras=2)

        for _ in range(5):
            analisar_unidade(unidade)

        self.assertEqual(Alert.objects.filter(tipo=Alert.Tipo.RUPTURA_ATIVA).count(), 1)

    def test_alerta_some_quando_o_problema_acaba(self):
        unidade, _, item = montar(estoque=0)
        vendas(item, por_dia=3, dias=20, ate_dias_atras=2)
        analisar_unidade(unidade)
        self.assertEqual(Alert.objects.filter(resolvido_em__isnull=True).count(), 1)

        item.total_quantity = 100
        item.save()
        analisar_unidade(unidade)

        abertos = Alert.objects.filter(resolvido_em__isnull=True,
                                       tipo=Alert.Tipo.RUPTURA_ATIVA)
        self.assertEqual(abertos.count(), 0)

    def test_divergencia_nunca_e_fechada_sozinha(self):
        """
        Furto não se resolve porque o worker rodou de novo. Este alerta
        exige alguém investigar e fechar à mão.
        """
        unidade, _, item = montar(estoque=20)
        registrar_divergencia(item, contado=17)
        analisar_unidade(unidade)

        self.assertTrue(
            Alert.objects.filter(tipo=Alert.Tipo.DIVERGENCIA,
                                 resolvido_em__isnull=True).exists()
        )


class Romaneio(TestCase):
    def test_gera_com_o_que_precisa_de_reposicao(self):
        unidade, _, item = montar(estoque=2)
        vendas(item, por_dia=3, dias=28)
        analisar_unidade(unidade)

        pl = gerar_picklist(unidade)
        self.assertEqual(pl.items.count(), 1)
        linha = pl.items.first()
        self.assertGreater(linha.quantidade_sugerida, 0)
        self.assertEqual(linha.estoque_no_momento, 2)

    def test_nao_inclui_item_abastecido(self):
        unidade, _, item = montar(estoque=500)
        vendas(item, por_dia=3, dias=28)
        analisar_unidade(unidade)

        self.assertEqual(gerar_picklist(unidade).items.count(), 0)

    def test_reaproveita_romaneio_aberto(self):
        """Dois romaneios simultâneos levariam a repor em dobro."""
        unidade, _, item = montar(estoque=2)
        vendas(item, por_dia=3, dias=28)
        analisar_unidade(unidade)

        a = gerar_picklist(unidade)
        b = gerar_picklist(unidade)
        self.assertEqual(a.id, b.id)
        self.assertEqual(PickList.objects.count(), 1)

    def test_guarda_a_fotografia_do_momento(self):
        unidade, _, item = montar(estoque=2)
        vendas(item, por_dia=3, dias=28)
        analisar_unidade(unidade)

        linha = gerar_picklist(unidade).items.first()
        self.assertIsNotNone(linha.cobertura_dias)
