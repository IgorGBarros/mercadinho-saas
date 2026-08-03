# backend/core/inventory/signals.py
import uuid
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import Store

User = get_user_model()


@receiver(pre_save, sender=User)
def sync_admin_status_from_email(sender, instance, **kwargs):
    """
    Sincroniza is_staff/is_superuser com a allowlist ADMIN_EMAILS.

    Fonte única de verdade para acesso ao painel admin: o email. Se o email
    do usuário está em ADMIN_EMAILS → is_staff=True; se não está → is_staff
    é forçado para False (mesmo que alguém tenha marcado manualmente no
    banco ou via DevTools). Roda em pre_save (não post_save) para não
    disparar salvamento recursivo.

    Usa pre_save porque queremos ajustar o objeto ANTES de gravar, sem um
    segundo .save().
    """
    admin_emails = getattr(settings, "ADMIN_EMAILS", [])
    email = (instance.email or "").strip().lower()

    # Se a lista está vazia (ex.: ambiente sem a env configurada), não mexe
    # em nada — evita trancar todo mundo por configuração ausente. O
    # superusuário criado por createsuperuser continua funcionando.
    if not admin_emails:
        return

    is_authorized = email in admin_emails
    # Só ajusta se divergir, para não sobrescrever à toa.
    if instance.is_staff != is_authorized:
        instance.is_staff = is_authorized
    # is_superuser acompanha is_staff para os autorizados; para não
    # autorizados, remove superuser também.
    if instance.is_superuser and not is_authorized:
        instance.is_superuser = False


# ⚠️ REMOVIDO: create_store_for_new_user
#
# Este signal criava uma Store a cada User salvo. Fazia sentido no modelo
# antigo (auto-cadastro de consultora, um usuário = uma loja). No
# mercadinho ele é nocivo por dois motivos:
#
#   1. Cada funcionário cadastrado viraria uma UNIDADE órfã. Como a
#      cobrança é por unidade ativa, contratar um repositor aumentaria a
#      fatura do cliente sem que ninguém entendesse por quê.
#   2. Convite de funcionário deve criar um Membership, nunca uma unidade.
#
# Quem cria Operator + primeira Unit é o fluxo de onboarding do cliente.
