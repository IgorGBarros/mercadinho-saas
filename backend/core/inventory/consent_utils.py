# backend/core/inventory/consent_utils.py
"""
Funções compartilhadas de consentimento LGPD (Art. 8º).

Centralizado aqui porque antes existiam duas implementações quase iguais
(uma em views.py, outra local em admin_views.py) — juntar num só lugar
evita que uma delas fique desatualizada enquanto a outra é corrigida.
"""
from django.db import NotSupportedError
from .models import ConsentRecord


def _active_records():
    return ConsentRecord.objects.filter(revoked_at__isnull=True)


def has_consent_for_purpose(user, purpose: str) -> bool:
    """Verifica se um usuário específico consentiu com uma finalidade."""
    if not user or not getattr(user, "is_authenticated", False):
        return False

    try:
        # Caminho nativo (Postgres): rápido e indexável.
        return _active_records().filter(
            user=user,
            purpose_flags__contains=[purpose],
        ).exists()
    except NotSupportedError:
        # Fallback para backends sem __contains em JSONField (ex.: SQLite):
        # avalia em Python. Correto, apenas menos eficiente.
        for rec in _active_records().filter(user=user).only("purpose_flags"):
            if purpose in (rec.purpose_flags or []):
                return True
        return False


def consented_user_ids(purpose: str):
    """
    IDs de usuários com consentimento ATIVO para a finalidade informada.
    Uso típico: filtrar qualquer queryset agregado/de treino por
    `owner_id__in=consented_user_ids('minha_finalidade')` antes de expor
    ou processar os dados.
    """
    try:
        return set(
            _active_records().filter(
                purpose_flags__contains=[purpose],
            ).values_list('user_id', flat=True)
        )
    except NotSupportedError:
        return {
            rec.user_id
            for rec in _active_records().only("user_id", "purpose_flags")
            if rec.user_id and purpose in (rec.purpose_flags or [])
        }