"""
Leitura de código de barras e prontidão fiscal.

    python manage.py test inventory.tests.test_barcode
"""
from decimal import Decimal

from django.test import TestCase

from inventory.barcode import TipoCodigo, gtin_valido, parse
from inventory.models import Product


class DigitoVerificador(TestCase):
    def test_aceita_gtins_reais(self):
        # Coca-Cola 2L, Leite Itambé, Nescau — códigos reais em circulação.
        for codigo in ('7894900011517', '7896051130215', '7891000100103'):
            self.assertTrue(gtin_valido(codigo), f'{codigo} deveria ser válido')

    def test_rejeita_digito_trocado(self):
        self.assertFalse(gtin_valido('7894900011518'))

    def test_rejeita_lixo(self):
        for ruim in ('', '123', 'abcdefghijklm', '78949000115170000'):
            self.assertFalse(gtin_valido(ruim))


class LeituraDeGtin(TestCase):
    def test_ean13_e_reconhecido(self):
        r = parse('7894900011517')
        self.assertEqual(r.tipo, TipoCodigo.GTIN)
        self.assertTrue(r.valido)
        self.assertTrue(r.precisa_catalogo_global)

    def test_upc_a_vira_ean13(self):
        """
        UPC-A de 12 dígitos é o mesmo produto que o EAN-13 com zero à
        esquerda. Sem normalizar, o mesmo item entra duas vezes no catálogo.
        """
        r = parse('012345678905')
        self.assertEqual(r.gtin, '0012345678905')
        self.assertEqual(len(r.gtin), 13)

    def test_leitura_suja_e_limpa(self):
        # Leitor USB às vezes entrega espaço ou hífen junto.
        self.assertTrue(parse(' 789-4900011517 ').valido)

    def test_codigo_invalido_nao_vai_pro_catalogo(self):
        r = parse('7894900011518')
        self.assertFalse(r.valido)
        self.assertFalse(r.precisa_catalogo_global)
        self.assertIn('verificador', r.erro)


class EtiquetaDeBalanca(TestCase):
    """
    O caso que quebra o sistema em açougue e hortifruti se não for tratado.
    """

    def _com_dv(self, doze: str) -> str:
        from inventory.barcode import digito_verificador
        return doze + str(digito_verificador(doze))

    def test_prefixo_2_e_lido_como_peso(self):
        # 2 + 0 | PLU 01234 | 01500 = 1,500 kg
        codigo = self._com_dv('200123401500')
        r = parse(codigo)
        self.assertEqual(r.tipo, TipoCodigo.BALANCA_PESO)
        self.assertEqual(r.plu, 1234)
        self.assertEqual(r.peso_kg, Decimal('1.5'))
        self.assertTrue(r.valido)

    def test_modo_preco_le_reais(self):
        codigo = self._com_dv('200123401500')
        r = parse(codigo, modo='preco')
        self.assertEqual(r.tipo, TipoCodigo.BALANCA_PRECO)
        self.assertEqual(r.preco, Decimal('15.00'))

    def test_etiqueta_de_balanca_nunca_consulta_catalogo_global(self):
        """
        A regra que evita o bug clássico: cada pesagem gera um código
        diferente, então buscar no catálogo global sempre falharia e a
        venda travaria.
        """
        r = parse(self._com_dv('200123401500'))
        self.assertFalse(r.precisa_catalogo_global)
        self.assertIsNone(r.gtin)

    def test_todos_os_prefixos_20_a_29(self):
        for pref in range(20, 30):
            r = parse(self._com_dv(f'{pref}0123401500'))
            self.assertIn(r.tipo, (TipoCodigo.BALANCA_PESO, TipoCodigo.BALANCA_PRECO),
                          f'prefixo {pref} deveria ser tratado como balança')

    def test_layout_configuravel(self):
        # Balança com 4 dígitos de PLU e 6 de valor.
        codigo = self._com_dv('201234012345')
        r = parse(codigo, digitos_plu=4, digitos_valor=6)
        self.assertEqual(r.plu, 1234)
        self.assertEqual(r.peso_kg, Decimal('12.345'))


class ProntidaoFiscal(TestCase):
    """
    Descobrir que falta NCM na hora em que a SEFAZ rejeita a nota — com o
    cliente já tendo pago — é caro. Esta checagem é barata e vem antes.
    """

    def test_produto_recem_escaneado_nao_esta_pronto(self):
        p = Product.objects.create(name='Refrigerante 2L', bar_code='7894900011517')
        self.assertFalse(p.is_fiscally_ready)
        self.assertIn('NCM', p.fiscal_pendencies)

    def test_com_ncm_valido_fica_pronto(self):
        p = Product.objects.create(
            name='Refrigerante 2L', bar_code='7894900011517', ncm='22021000'
        )
        self.assertTrue(p.is_fiscally_ready)
        self.assertEqual(p.fiscal_pendencies, [])

    def test_ncm_curto_e_recusado(self):
        p = Product.objects.create(name='Item', ncm='2202')
        self.assertFalse(p.is_fiscally_ready)
        self.assertIn('8 dígitos', ' '.join(p.fiscal_pendencies))

    def test_defaults_servem_para_mercadinho(self):
        p = Product.objects.create(name='Item')
        self.assertEqual(p.cfop, '5102')          # venda dentro do estado
        self.assertEqual(p.origem, '0')           # nacional
        self.assertEqual(p.csosn, '102')          # Simples, sem crédito
        self.assertEqual(p.unidade_com, 'UN')

    def test_plu_de_balanca_e_unico(self):
        from django.db.utils import IntegrityError
        Product.objects.create(name='Picanha', requires_scale=True, scale_plu=101)
        with self.assertRaises(IntegrityError):
            Product.objects.create(name='Alcatra', requires_scale=True, scale_plu=101)

    def test_plu_repetido_e_permitido_se_nao_for_granel(self):
        # A constraint é parcial: só vale quando requires_scale=True.
        Product.objects.create(name='A', requires_scale=False, scale_plu=None)
        Product.objects.create(name='B', requires_scale=False, scale_plu=None)
