"""
Onboarding de um cliente novo.

Substitui o signal `create_store_for_new_user`, que criava uma loja a cada
usuário salvo. Agora a criação de uma operação é um ato deliberado — porque
cada unidade entra na fatura do cliente.

    python manage.py onboard_operator \\
        --email dono@mercadinho.com \\
        --operator "Mercadinho do Zé LTDA" \\
        --cnpj 12345678000199 \\
        --unit "Condomínio Vila Nova" \\
        --mode unattended
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from inventory.models import Store
from tenancy.models import Membership, Operator

User = get_user_model()


class Command(BaseCommand):
    help = "Cria Operator + primeira Unit + Membership(owner) para um cliente novo."

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True, help="E-mail do dono (usuário já existente)")
        parser.add_argument('--operator', required=True, help="Nome fantasia da empresa")
        parser.add_argument('--unit', required=True, help="Nome da primeira unidade")
        parser.add_argument('--cnpj', default=None)
        parser.add_argument('--legal-name', default='', help="Razão social")
        parser.add_argument(
            '--mode', default='unattended',
            choices=[c[0] for c in Store.Mode.choices],
            help="unattended = totem de condomínio; attended = balcão de bairro",
        )
        parser.add_argument('--trial-days', type=int, default=14)

    @transaction.atomic
    def handle(self, *args, **opts):
        try:
            dono = User.objects.get(email__iexact=opts['email'])
        except User.DoesNotExist:
            raise CommandError(
                f"Usuário {opts['email']} não existe. "
                "Crie primeiro com createsuperuser ou pelo cadastro."
            )

        cnpj = (opts['cnpj'] or '').replace('.', '').replace('/', '').replace('-', '') or None
        if cnpj and Operator.objects.filter(cnpj=cnpj).exists():
            raise CommandError(f"Já existe uma operação com o CNPJ {cnpj}.")

        operador = Operator.objects.create(
            name=opts['operator'],
            legal_name=opts['legal_name'],
            cnpj=cnpj,
        )
        operador.start_trial(dias=opts['trial_days'])

        # Slug único sem depender de contador global: o id do operador já
        # garante unicidade entre clientes diferentes com o mesmo nome de
        # unidade ("Condomínio Vila Nova" é um nome bem comum).
        base = slugify(opts['unit'])[:80] or 'unidade'
        slug = f"{base}-{operador.id}"
        sufixo = 1
        while Store.objects.filter(slug=slug).exists():
            sufixo += 1
            slug = f"{base}-{operador.id}-{sufixo}"

        unidade = Store.objects.create(
            operator=operador,
            name=opts['unit'],
            slug=slug,
            mode=opts['mode'],
            owner=dono,  # ⚠️ campo legado, sai quando o OneToOne for removido
        )

        vinculo = Membership.objects.create(
            user=dono,
            operator=operador,
            role=Membership.Role.OWNER,
        )
        # units vazio de propósito: dono enxerga todas as unidades da operação,
        # inclusive as que ainda vão ser criadas.

        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Operação criada\n"
            f"   Operator   #{operador.id}  {operador.name}\n"
            f"   Unit       #{unidade.id}  {unidade.name}  ({unidade.get_mode_display()})\n"
            f"   Membership #{vinculo.id}  {dono.email} → {vinculo.get_role_display()}\n"
            f"   Trial até  {operador.trial_ends_at:%d/%m/%Y}\n"
            f"   Vitrine    /{unidade.slug}\n"
        ))
