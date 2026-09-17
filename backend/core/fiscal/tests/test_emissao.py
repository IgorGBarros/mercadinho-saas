"""
Emissão de NFC-e.

Nenhum teste toca a SEFAZ nem o provedor: tudo mockado.

    python manage.py test fiscal
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.test import TestCase, override_settings
from django.utils import timezone

from fiscal.models import FiscalDocument
from fiscal.services import emissao
from inventory.models import InventoryBatch, InventoryItem, Product, Store
from pos.services.checkout import abrir_checkout, confirmar_pagamento
from tenancy.models import Operator


def cenario(*, cnpj='12345678000199', ncm='22021000', regime='simples'):
    operador = Operator.objects.create(name='Op', cnpj=cnpj, tax_regime=regime)
    unidade = Store.objects.create(operator=operador, name='U', slug='u1')
    produto = Product.objects.create(
        name='Refrigerante 2L', bar_code='7894900011517', ncm=ncm
    )
    item = InventoryItem.objects.create(
        store=unidade, product=produto, total_quantity=10,
        sale_price=Decimal('5.00'), cost_price=Decimal('3.00'),
    )
    InventoryBatch.objects.create(
        item=item, quantity=10, expiration_date=date.today() + timedelta(days=30)
    )
    return operador, unidade, produto


def vender(unidade, produto, qtd=2, payment_id='pay_x'):
    c = abrir_checkout(unit=unidade, itens=[{'product_id': produto.id, 'quantity': qtd}])
    return confirmar_pagamento(payment_id=payment_id, checkout=c).sale


def resposta(corpo, status=200):
    m = Mock()
    m.status_code = status
    m.json.return_value = corpo
    return m


class NotaNaoBloqueiaVenda(TestCase):
    """A garantia mais importante do módulo inteiro."""

    def test_venda_fecha_e_nota_fica_pendente(self):
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)

        doc = FiscalDocument.objects.get(sale=venda)
        self.assertEqual(doc.status, FiscalDocument.Status.PENDENTE)
        self.assertEqual(doc.ref, f'venda-{venda.id}')

    def test_provedor_fora_do_ar_nao_desfaz_a_venda(self):
        _, unidade, produto = cenario()
        with patch('fiscal.services.emissao.requests.post',
                   side_effect=requests.Timeout('fora do ar')):
            venda = vender(unidade, produto)
            emissao.transmitir(FiscalDocument.objects.get(sale=venda))

        venda.refresh_from_db()
        self.assertEqual(venda.total_amount, Decimal('10.00'))
        self.assertEqual(venda.fiscal.status, FiscalDocument.Status.PENDENTE)
        self.assertIsNotNone(venda.fiscal.proxima_tentativa)

    def test_enfileirar_e_idempotente(self):
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)
        emissao.enfileirar(venda)
        emissao.enfileirar(venda)
        self.assertEqual(FiscalDocument.objects.filter(sale=venda).count(), 1)


@override_settings(FOCUS_NFE_TOKEN='token-de-teste')
class Transmissao(TestCase):
    def setUp(self):
        self.operador, self.unidade, self.produto = cenario()
        self.venda = vender(self.unidade, self.produto)
        self.doc = FiscalDocument.objects.get(sale=self.venda)

    def test_autorizacao_guarda_chave_e_danfe(self):
        corpo = {
            'status': 'autorizado', 'chave_nfe': '2' * 44,
            'numero_protocolo': '135240000123456', 'numero': '1', 'serie': '1',
            'caminho_danfe': 'https://exemplo/danfe.pdf',
            'caminho_xml_nota_fiscal': 'https://exemplo/nota.xml',
        }
        with patch('fiscal.services.emissao.requests.post', return_value=resposta(corpo)):
            doc = emissao.transmitir(self.doc)

        self.assertEqual(doc.status, FiscalDocument.Status.AUTORIZADO)
        self.assertEqual(doc.chave_acesso, '2' * 44)
        self.assertIsNone(doc.proxima_tentativa)

    def test_usa_a_mesma_ref_no_retry(self):
        """
        Evita nota duplicada: se a rede cair depois de transmitir e antes
        da resposta, o provedor reconhece a ref e devolve a nota já
        emitida em vez de emitir outra.
        """
        with patch('fiscal.services.emissao.requests.post',
                   side_effect=requests.Timeout()) as post:
            emissao.transmitir(self.doc)
        ref_1 = post.call_args.kwargs['params']['ref']

        self.doc.refresh_from_db()
        with patch('fiscal.services.emissao.requests.post',
                   side_effect=requests.Timeout()) as post:
            emissao.transmitir(self.doc)
        self.assertEqual(post.call_args.kwargs['params']['ref'], ref_1)

    def test_rejeicao_nao_agenda_retry(self):
        """
        NCM errado dá o mesmo erro para sempre. Insistir queima cota do
        provedor e esconde do lojista que ele precisa corrigir o cadastro.
        """
        corpo = {'status': 'erro_autorizacao', 'status_sefaz': '539',
                 'mensagem_sefaz': 'Duplicidade de NF-e'}
        with patch('fiscal.services.emissao.requests.post', return_value=resposta(corpo, 422)):
            doc = emissao.transmitir(self.doc)

        self.assertEqual(doc.status, FiscalDocument.Status.REJEITADO)
        self.assertIsNone(doc.proxima_tentativa)
        self.assertEqual(doc.codigo_erro, '539')

    def test_processando_consulta_depois_sem_retransmitir(self):
        with patch('fiscal.services.emissao.requests.post',
                   return_value=resposta({'status': 'processando_autorizacao'})):
            doc = emissao.transmitir(self.doc)

        self.assertEqual(doc.status, FiscalDocument.Status.PROCESSANDO)

        with patch('fiscal.services.emissao.requests.get',
                   return_value=resposta({'status': 'autorizado', 'chave_nfe': '3' * 44})), \
             patch('fiscal.services.emissao.requests.post') as post:
            doc.proxima_tentativa = timezone.now() - timedelta(seconds=1)
            doc.save()
            emissao.processar_pendentes()
            post.assert_not_called()

        doc.refresh_from_db()
        self.assertEqual(doc.status, FiscalDocument.Status.AUTORIZADO)

    def test_backoff_cresce_e_desiste_no_teto(self):
        for _ in range(FiscalDocument.MAX_TENTATIVAS):
            self.doc.agendar_retry('falhou', 'rede')
        self.assertEqual(self.doc.status, FiscalDocument.Status.ERRO)
        self.assertIsNone(self.doc.proxima_tentativa)


@override_settings(FOCUS_NFE_TOKEN='token-de-teste')
class ValidacaoAntesDeGastarChamada(TestCase):
    def test_produto_sem_ncm_e_barrado_localmente(self):
        """Checagem instantânea evita ida à SEFAZ e cota queimada."""
        _, unidade, produto = cenario(ncm='')
        venda = vender(unidade, produto)
        doc = FiscalDocument.objects.get(sale=venda)

        with patch('fiscal.services.emissao.requests.post') as post:
            doc = emissao.transmitir(doc)
            post.assert_not_called()

        self.assertEqual(doc.status, FiscalDocument.Status.REJEITADO)
        self.assertIn('NCM', doc.erro)

    def test_operador_sem_cnpj_e_barrado(self):
        _, unidade, produto = cenario(cnpj=None)
        venda = vender(unidade, produto)
        doc = FiscalDocument.objects.get(sale=venda)

        with patch('fiscal.services.emissao.requests.post') as post:
            doc = emissao.transmitir(doc)
            post.assert_not_called()
        self.assertIn('CNPJ', doc.erro)

    def test_sem_token_apenas_reagenda(self):
        """Falta de configuração é temporária — não rejeita a nota."""
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)
        with override_settings(FOCUS_NFE_TOKEN=''):
            doc = emissao.transmitir(FiscalDocument.objects.get(sale=venda))
        self.assertEqual(doc.status, FiscalDocument.Status.PENDENTE)
        self.assertIsNotNone(doc.proxima_tentativa)


class Payload(TestCase):
    def test_usa_valores_congelados_da_venda(self):
        """
        Reler o cadastro atual geraria nota divergente do que foi vendido
        — e é exatamente isso que a fiscalização compara.
        """
        _, unidade, produto = cenario()
        venda = vender(unidade, produto, qtd=2)

        produto.name = 'Nome mudou depois'
        produto.save()
        InventoryItem.objects.filter(store=unidade).update(sale_price=Decimal('99.00'))

        p = emissao.montar_payload(venda)
        self.assertEqual(p['items'][0]['valor_unitario_comercial'], '5.00')
        self.assertEqual(p['formas_pagamento'][0]['valor_pagamento'], '10.00')

    def test_pix_vai_como_forma_17(self):
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)
        p = emissao.montar_payload(venda)
        self.assertEqual(p['formas_pagamento'][0]['forma_pagamento'], '17')

    def test_simples_usa_csosn(self):
        _, unidade, produto = cenario(regime='simples')
        venda = vender(unidade, produto)
        p = emissao.montar_payload(venda)
        self.assertEqual(p['items'][0]['icms_situacao_tributaria'], '102')

    def test_presencial_porque_o_comprador_esta_na_loja(self):
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)
        self.assertEqual(emissao.montar_payload(venda)['presenca_comprador'], '1')


@override_settings(FOCUS_NFE_TOKEN='token-de-teste')
class Worker(TestCase):
    def test_nota_problematica_nao_impede_as_outras(self):
        _, unidade, ok = cenario()
        ruim = Product.objects.create(name='Sem NCM', bar_code='7896051130215')
        inv = InventoryItem.objects.create(
            store=unidade, product=ruim, total_quantity=5,
            sale_price=Decimal('2.00'), cost_price=Decimal('1.00'),
        )
        InventoryBatch.objects.create(item=inv, quantity=5)

        vender(unidade, ok, payment_id='pay_ok')
        vender(unidade, ruim, payment_id='pay_ruim')

        with patch('fiscal.services.emissao.requests.post',
                   return_value=resposta({'status': 'autorizado', 'chave_nfe': '4' * 44})):
            r = emissao.processar_pendentes()

        self.assertEqual(r['autorizadas'], 1)
        self.assertEqual(r['rejeitadas'], 1)

    def test_so_pega_o_que_ja_venceu_o_agendamento(self):
        _, unidade, produto = cenario()
        venda = vender(unidade, produto)
        doc = FiscalDocument.objects.get(sale=venda)
        doc.proxima_tentativa = timezone.now() + timedelta(hours=1)
        doc.save()

        with patch('fiscal.services.emissao.requests.post') as post:
            emissao.processar_pendentes()
            post.assert_not_called()
