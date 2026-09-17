"""
Cascata de resolução de GTIN.

Nenhum teste bate na internet: os provedores são mockados. Teste que
depende de rede falha por motivo errado e some da rotina de todo mundo.

    python manage.py test inventory.tests.test_gtin
"""
from unittest.mock import patch

from decimal import Decimal

import requests
from django.test import TestCase

from inventory.barcode import digito_verificador
from inventory.models import ExternalBarcodeCatalog, Product
from inventory.services import gtin as svc

EAN = '7894900011517'


def _balanca(doze: str) -> str:
    return doze + str(digito_verificador(doze))


class CatalogoLocalTemPrioridade(TestCase):
    def test_produto_local_nao_dispara_consulta_externa(self):
        Product.objects.create(name='Refri 2L', bar_code=EAN, ncm='22021000')

        with patch.object(svc, '_consultar_cosmos') as cosmos, \
             patch.object(svc, '_consultar_openfoodfacts') as off:
            r = svc.resolver(EAN)

        self.assertEqual(r.origem, 'local')
        cosmos.assert_not_called()
        off.assert_not_called()

    def test_avisa_pendencia_fiscal_do_produto_local(self):
        Product.objects.create(name='Refri 2L', bar_code=EAN)  # sem NCM
        r = svc.resolver(EAN)
        self.assertTrue(r.encontrado)
        self.assertIn('NCM', ' '.join(r.avisos))


class ProvedoresExternos(TestCase):
    def test_cosmos_traz_ncm_e_e_gravado_no_cache(self):
        retorno = {'nome': 'Refrigerante Cola 2L', 'marca': 'Coca-Cola',
                   'ncm': '22021000', 'imagem': '', 'origem': 'cosmos'}

        with patch.object(svc, '_consultar_cosmos', return_value=retorno):
            r = svc.resolver(EAN)

        self.assertEqual(r.origem, 'cosmos')
        self.assertEqual(r.ncm, '22021000')
        self.assertEqual(r.avisos, [])
        self.assertTrue(ExternalBarcodeCatalog.objects.filter(gtin=EAN).exists())

    def test_segunda_leitura_usa_cache_e_nao_consulta_de_novo(self):
        """
        O que impede a conta do Cosmos de explodir: mercadinho reescaneia
        o mesmo refrigerante centenas de vezes por mês.
        """
        retorno = {'nome': 'Refrigerante Cola 2L', 'marca': 'Coca-Cola',
                   'ncm': '22021000', 'imagem': '', 'origem': 'cosmos'}

        with patch.object(svc, '_consultar_cosmos', return_value=retorno) as cosmos:
            svc.resolver(EAN)
            self.assertEqual(cosmos.call_count, 1)
            r2 = svc.resolver(EAN)
            self.assertEqual(cosmos.call_count, 1, 'não pode consultar duas vezes')

        self.assertEqual(r2.origem, 'cache')

    def test_cai_para_open_food_facts_quando_cosmos_nao_responde(self):
        off = {'nome': 'Refrigerante Cola', 'marca': 'Coca-Cola',
               'ncm': '', 'imagem': '', 'origem': 'openfoodfacts'}

        with patch.object(svc, '_consultar_cosmos', return_value=None), \
             patch.object(svc, '_consultar_openfoodfacts', return_value=off):
            r = svc.resolver(EAN)

        self.assertEqual(r.origem, 'openfoodfacts')
        self.assertIn('NCM', ' '.join(r.avisos))

    def test_api_fora_do_ar_nao_derruba_o_cadastro(self):
        """
        A garantia mais importante: catálogo externo indisponível devolve
        'cadastre manualmente', nunca uma exceção que fecharia a loja.
        """
        with patch('inventory.services.gtin.requests.get',
                   side_effect=requests.Timeout('timeout')):
            r = svc.resolver(EAN)

        self.assertFalse(r.encontrado)
        self.assertIn('manualmente', r.erro)

    def test_json_quebrado_tambem_e_absorvido(self):
        with patch('inventory.services.gtin.requests.get',
                   side_effect=ValueError('json inválido')):
            r = svc.resolver(EAN)
        self.assertFalse(r.encontrado)


class ModoOffline(TestCase):
    def test_totem_sem_internet_so_olha_o_local(self):
        with patch.object(svc, '_consultar_cosmos') as cosmos:
            r = svc.resolver(EAN, buscar_externo=False)
        cosmos.assert_not_called()
        self.assertIn('desativada', r.erro)


class Balanca(TestCase):
    def test_plu_cadastrado_resolve_com_peso(self):
        Product.objects.create(name='Picanha', requires_scale=True,
                               scale_plu=1234, ncm='02013000')
        with patch.object(svc, '_consultar_cosmos') as cosmos:
            r = svc.resolver(_balanca('200123401500'))

        self.assertTrue(r.encontrado)
        self.assertEqual(r.origem, 'balanca')
        self.assertEqual(r.nome, 'Picanha')
        self.assertEqual(r.peso_kg, Decimal('1.5'))
        cosmos.assert_not_called()

    def test_plu_desconhecido_avisa_sem_ir_pra_internet(self):
        with patch.object(svc, '_consultar_cosmos') as cosmos:
            r = svc.resolver(_balanca('209999901500'))
        self.assertFalse(r.encontrado)
        self.assertIn('99999', r.erro)
        cosmos.assert_not_called()


class CriacaoDeProduto(TestCase):
    def test_cria_produto_com_ncm_da_consulta(self):
        retorno = {'nome': 'Refrigerante Cola 2L', 'marca': 'Coca-Cola',
                   'ncm': '22021000', 'imagem': '', 'origem': 'cosmos'}
        with patch.object(svc, '_consultar_cosmos', return_value=retorno):
            r = svc.resolver(EAN)

        p, criado = svc.criar_produto_da_resolucao(r)
        self.assertTrue(criado)
        self.assertEqual(p.ncm, '22021000')
        self.assertTrue(p.is_fiscally_ready)

    def test_nao_sobrescreve_produto_existente(self):
        """
        Quem já está no catálogo tem preço, NCM conferido e histórico.
        Uma consulta externa não passa por cima disso.
        """
        Product.objects.create(name='Nome do lojista', bar_code=EAN, ncm='11111111')
        r = svc.Resolucao(gtin=EAN, nome='Nome do Cosmos', ncm='22021000')

        p, criado = svc.criar_produto_da_resolucao(r)
        self.assertFalse(criado)
        self.assertEqual(p.name, 'Nome do lojista')
        self.assertEqual(p.ncm, '11111111')
