# backend/core/inventory/management/commands/dedupe_consents.py
"""
Limpa registros de consentimento duplicados que se acumularam antes da
correção de deduplicação no ConsentRecordSerializer.create().

Para cada titular (user, email ou session_id) + versão do termo:
mantém ATIVO só o registro mais recente; os demais ativos são marcados
como revogados (revoked_at = agora). Nada é apagado — o histórico
continua no banco para auditoria (LGPD), só deixa de contar como ativo.

Uso:
    python manage.py dedupe_consents           # simulação (não altera nada)
    python manage.py dedupe_consents --apply   # aplica de verdade
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from inventory.models import ConsentRecord


class Command(BaseCommand):
    help = "Revoga registros de consentimento ativos duplicados, mantendo só o mais recente por titular+versão."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Aplica as mudanças. Sem esta flag, apenas simula e mostra o que faria.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        now = timezone.now()

        actives = ConsentRecord.objects.filter(revoked_at__isnull=True).order_by("-accepted_at")

        seen = set()          # chaves (titular, versão) já com um ativo mantido
        to_revoke_ids = []

        for rec in actives:
            if rec.user_id:
                holder = ("user", rec.user_id)
            elif rec.email:
                holder = ("email", rec.email.lower())
            elif rec.session_id:
                holder = ("session", rec.session_id)
            else:
                holder = ("orphan", rec.id)  # sem titular identificável: mantém

            key = (holder, rec.term_version)
            if key in seen:
                to_revoke_ids.append(rec.id)
            else:
                seen.add(key)

        self.stdout.write(f"Registros ativos no total: {actives.count()}")
        self.stdout.write(f"Duplicados a revogar: {len(to_revoke_ids)}")
        self.stdout.write(f"Ficarão ativos: {actives.count() - len(to_revoke_ids)}")

        if not to_revoke_ids:
            self.stdout.write(self.style.SUCCESS("Nada a fazer."))
            return

        if apply_changes:
            updated = ConsentRecord.objects.filter(id__in=to_revoke_ids).update(revoked_at=now)
            self.stdout.write(self.style.SUCCESS(f"✅ {updated} registros duplicados revogados."))
        else:
            self.stdout.write(self.style.WARNING(
                "Simulação apenas — nada foi alterado. Rode com --apply para aplicar."
            ))