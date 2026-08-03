"""
Isolamento entre operações — fronteira de segurança.

Isto precisa ser teste automatizado, não revisão de código. O pior incidente
possível num SaaS multi-cliente é o mercadinho do condomínio A enxergar o
faturamento do condomínio B, e revisão humana não pega isso de forma
confiável quando são ~72 pontos de filtro.

    python manage.py test tenancy
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.test import APIRequestFactory

from inventory.models import Store
from inventory.utils import (
    allowed_units,
    ensure_user_has_store,
    get_membership,
    resolve_unit,
)
from tenancy.models import Membership, Operator

User = get_user_model()


def criar_operacao(nome, email, n_unidades=1):
    dono = User.objects.create_user(email=email, password='senha-de-teste-123')
    operador = Operator.objects.create(name=nome)
    unidades = [
        Store.objects.create(
            operator=operador, name=f"{nome} — unidade {i}", slug=f"{nome.lower()}-{i}"
        )
        for i in range(1, n_unidades + 1)
    ]
    vinculo = Membership.objects.create(
        user=dono, operator=operador, role=Membership.Role.OWNER
    )
    return dono, operador, unidades, vinculo


class IsolamentoEntreOperacoes(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.dono_a, self.op_a, self.unidades_a, _ = criar_operacao('Alfa', 'a@teste.com', 2)
        self.dono_b, self.op_b, self.unidades_b, _ = criar_operacao('Beta', 'b@teste.com', 1)

    def _req(self, user, unit_id=None):
        headers = {'HTTP_X_UNIT_ID': str(unit_id)} if unit_id else {}
        req = self.factory.get('/', **headers)
        req.user = user
        return req

    def test_dono_ve_apenas_as_proprias_unidades(self):
        visiveis = set(allowed_units(self.dono_a).values_list('id', flat=True))
        self.assertEqual(visiveis, {u.id for u in self.unidades_a})
        self.assertNotIn(self.unidades_b[0].id, visiveis)

    def test_unidade_alheia_no_header_devolve_404_e_nao_403(self):
        # 403 confirmaria que a unidade existe. Para quem sonda IDs, ela
        # simplesmente não existe.
        with self.assertRaises(NotFound):
            resolve_unit(self._req(self.dono_a, self.unidades_b[0].id))

    def test_header_valido_troca_a_unidade_ativa(self):
        segunda = self.unidades_a[1]
        self.assertEqual(resolve_unit(self._req(self.dono_a, segunda.id)).id, segunda.id)

    def test_sem_header_cai_na_primeira_unidade(self):
        self.assertEqual(resolve_unit(self._req(self.dono_a)).id, self.unidades_a[0].id)


class AcessoNegadoPorPadrao(TestCase):
    """
    A regressão mais importante deste refactor.

    A implementação antiga CRIAVA uma loja quando o usuário não tinha
    nenhuma. Um usuário sem permissão recebia um tenant novo em vez de 403.
    """

    def test_usuario_sem_vinculo_e_barrado_e_nada_e_criado(self):
        orfao = User.objects.create_user(email='orfao@teste.com', password='senha-123456')
        antes = Store.objects.count()

        with self.assertRaises(PermissionDenied):
            get_membership(orfao)
        with self.assertRaises(PermissionDenied):
            ensure_user_has_store(orfao)

        self.assertEqual(Store.objects.count(), antes, "não pode criar unidade sozinho")

    def test_vinculo_desativado_perde_acesso_na_hora(self):
        dono, operador, _, vinculo = criar_operacao('Gama', 'g@teste.com')
        vinculo.is_active = False
        vinculo.save(update_fields=['is_active'])

        with self.assertRaises(PermissionDenied):
            allowed_units(dono)

    def test_operacao_inativa_bloqueia_todo_mundo(self):
        dono, operador, _, _ = criar_operacao('Delta', 'd@teste.com')
        operador.is_active = False
        operador.save(update_fields=['is_active'])

        with self.assertRaises(PermissionDenied):
            allowed_units(dono)


class RestricaoPorUnidade(TestCase):
    """Repositor que atende só 2 das 3 unidades da operação."""

    def test_stocker_restrito_nao_ve_a_terceira_unidade(self):
        _, operador, unidades, _ = criar_operacao('Epsilon', 'e@teste.com', 3)
        repositor = User.objects.create_user(email='rep@teste.com', password='senha-123456')

        vinculo = Membership.objects.create(
            user=repositor, operator=operador, role=Membership.Role.STOCKER
        )
        vinculo.units.set(unidades[:2])

        visiveis = set(allowed_units(repositor).values_list('id', flat=True))
        self.assertEqual(visiveis, {unidades[0].id, unidades[1].id})
        self.assertNotIn(unidades[2].id, visiveis)

    def test_papeis_definem_o_que_cada_um_enxerga(self):
        _, operador, _, _ = criar_operacao('Zeta', 'z@teste.com')

        def vinculo_com(papel, email):
            u = User.objects.create_user(email=email, password='senha-123456')
            return Membership.objects.create(user=u, operator=operador, role=papel)

        dono = vinculo_com(Membership.Role.OWNER, 'o@teste.com')
        gerente = vinculo_com(Membership.Role.MANAGER, 'm@teste.com')
        repositor = vinculo_com(Membership.Role.STOCKER, 's@teste.com')
        sindico = vinculo_com(Membership.Role.VIEWER, 'v@teste.com')

        # Custo é dado comercial do dono — repositor e síndico não veem.
        self.assertTrue(dono.can_see_costs)
        self.assertTrue(gerente.can_see_costs)
        self.assertFalse(repositor.can_see_costs)
        self.assertFalse(sindico.can_see_costs)

        # Síndico é leitura pura; repositor movimenta estoque.
        self.assertTrue(repositor.can_write_stock)
        self.assertFalse(sindico.can_write_stock)

        # Certificado fiscal e criação de unidade (afeta a fatura): só o dono.
        self.assertTrue(dono.can_manage_operator)
        self.assertFalse(gerente.can_manage_operator)
