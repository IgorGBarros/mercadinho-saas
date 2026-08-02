"""
Smoke tests de fumaça para o app inventory.

Objetivo: pegar automaticamente, no CI, as regressões que apareceram
repetidamente durante o desenvolvimento — antes de chegarem em produção:
  - rotas de admin/payments sumindo do core/urls.py (aconteceu 3x)
  - signal de cadastro quebrado (campo owner vs user)
  - serializer de consentimento sem os campos certos
  - vazamento de estoque entre lojas (isolamento de tenant)
  - dashboard_stats com 500 por campo inexistente
  - endpoints admin retornando 404/500

Rode com: python manage.py test inventory
"""
from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import resolve, Resolver404
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from inventory.models import (
    Store, Product, InventoryItem, StockTransaction, PlanConfig,
)

User = get_user_model()


class SecureAPIClient(APIClient):
    """Cliente que envia tudo como HTTPS — o settings tem SECURE_SSL_REDIRECT,
    que responde 301 para requisições http em teste."""
    def get(self, *a, **k):
        k.setdefault("secure", True); return super().get(*a, **k)
    def post(self, *a, **k):
        k.setdefault("secure", True); return super().post(*a, **k)
    def patch(self, *a, **k):
        k.setdefault("secure", True); return super().patch(*a, **k)


def auth_client(user):
    c = SecureAPIClient()
    token = str(RefreshToken.for_user(user).access_token)
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


class RoutingSmokeTests(TestCase):
    """Garante que as rotas críticas existem — pega a perda de include()."""

    CRITICAL_ROUTES = [
        "/api/profile/",
        "/api/stats/dashboard/",
        "/api/inventory/",
        "/api/transactions/",
        "/api/consent/my/",
        "/api/admin/users/",
        "/api/admin/stats/",
        "/api/admin/plan-configs/",
        "/api/admin/promotions/",
        "/api/admin/api-monitor/",
        "/api/payments/asaas/config/",
        "/api/chat/ask/",
        "/api/plans/",
    ]

    def test_all_critical_routes_resolve(self):
        faltando = []
        for url in self.CRITICAL_ROUTES:
            try:
                resolve(url)
            except Resolver404:
                faltando.append(url)
        self.assertEqual(faltando, [], f"Rotas sem registro: {faltando}")


class SignupSignalTests(TestCase):
    """O post_save de CustomUser deve criar a Store automaticamente."""

    def test_new_user_gets_store(self):
        u = User.objects.create(email="nova@consultora.com")
        self.assertTrue(hasattr(u, "store"))
        self.assertIsNotNone(u.store)
        self.assertEqual(u.store.owner_id, u.id)


class TenantIsolationTests(TestCase):
    """Uma loja nunca pode ver o estoque de outra."""

    def setUp(self):
        self.u1 = User.objects.create(email="loja1@a.com")
        self.u2 = User.objects.create(email="loja2@a.com")
        p = Product.objects.create(name="Kaiak", brand="Natura")
        InventoryItem.objects.create(
            store=self.u1.store, product=p, total_quantity=10,
            cost_price=Decimal("10"), sale_price=Decimal("20"),
        )

    def test_inventory_is_isolated(self):
        r1 = auth_client(self.u1).get("/api/inventory/")
        r2 = auth_client(self.u2).get("/api/inventory/")
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(len(r1.json()), 1)
        self.assertEqual(len(r2.json()), 0, "Loja 2 NAO deveria ver estoque da loja 1")

    def test_inventory_returns_plain_array(self):
        """Frontend espera array puro, nao {count, results}."""
        r = auth_client(self.u1).get("/api/inventory/")
        self.assertIsInstance(r.json(), list)


class DashboardStatsTests(TestCase):
    def test_dashboard_stats_ok(self):
        u = User.objects.create(email="dash@a.com")
        p = Product.objects.create(name="Essencial", brand="Natura")
        InventoryItem.objects.create(
            store=u.store, product=p, total_quantity=5,
            cost_price=Decimal("10"), sale_price=Decimal("25"),
        )
        r = auth_client(u).get("/api/stats/dashboard/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("investedValue", r.json())


class ConsentSerializerTests(TestCase):
    def test_consent_my_exposes_purposes(self):
        from inventory.models import ConsentRecord
        from django.utils import timezone
        u = User.objects.create(email="consent@a.com")
        ConsentRecord.objects.create(
            user=u, email=u.email,
            purpose_flags=["essential", "authentication", "ai_training"],
            term_version="v1.0_2026-05", accepted_at=timezone.now(),
        )
        r = auth_client(u).get("/api/consent/my/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        consents = body.get("consents", body if isinstance(body, list) else [])
        self.assertTrue(consents, "deveria retornar ao menos 1 consentimento")
        self.assertIn("purposes", consents[0])
        self.assertIn("ai_training", consents[0]["purposes"])


@override_settings(ADMIN_EMAILS=["staff@a.com"])
class ProfileExposesStaffTests(TestCase):
    def test_profile_has_email_and_is_staff(self):
        u = User.objects.create(email="staff@a.com")
        r = auth_client(u).get("/api/profile/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data.get("email"), "staff@a.com")
        self.assertIs(data.get("is_staff"), True)


@override_settings(ADMIN_EMAILS=["admin@a.com"])
class AdminEndpointsTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(email="admin@a.com")
        self.normal = User.objects.create(email="user@a.com")

    def test_admin_endpoints_ok_for_staff(self):
        c = auth_client(self.admin)
        for url in ["/api/admin/users/", "/api/admin/stats/",
                    "/api/admin/plan-configs/", "/api/admin/promotions/",
                    "/api/admin/api-monitor/", "/api/admin/analytics/products/"]:
            r = c.get(url)
            self.assertEqual(r.status_code, 200, f"{url} deu {r.status_code}")

    def test_admin_blocked_for_normal_user(self):
        r = auth_client(self.normal).get("/api/admin/users/")
        self.assertIn(r.status_code, (401, 403))

    def test_admin_revenue_from_stock_transactions(self):
        """Receita deve refletir StockTransaction (fonte canonica)."""
        p = Product.objects.create(name="Luna", brand="Natura")
        for q in (2, 3):
            StockTransaction.objects.create(
                store=self.admin.store, product=p, transaction_type="VENDA",
                quantity=-q, unit_cost=Decimal("10"), unit_price=Decimal("25"),
            )
        r = auth_client(self.admin).get("/api/admin/stats/")
        self.assertEqual(r.status_code, 200)
        # 5 unidades * R$25 = R$125
        self.assertEqual(float(r.json()["total_revenue"]), 125.0)


@override_settings(ADMIN_EMAILS=["admin2@a.com"])
class PlanConfigIntegrationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(email="admin2@a.com")
        PlanConfig.objects.create(
            plan_type="pro", display_name="PRO",
            monthly_price=Decimal("39.90"), yearly_price=Decimal("399.00"),
            is_visible=True,
        )

    def test_public_plans_lists_price(self):
        r = SecureAPIClient().get("/api/plans/")
        self.assertEqual(r.status_code, 200)
        pro = next(p for p in r.json() if p["plan_type"] == "pro")
        self.assertEqual(float(pro["monthly_price"]), 39.90)

    def test_admin_can_edit_plan_price(self):
        r = auth_client(self.admin).patch(
            "/api/admin/plan-configs/pro/",
            {"monthly_price": 49.90}, format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(r.json()["monthly_price"]), 49.90)

    def test_asaas_price_reads_from_plan_config(self):
        from apps.payments.services.asaas_service import AsaasService
        self.assertEqual(AsaasService._get_pro_price("monthly"), 39.90)
        self.assertEqual(AsaasService._get_pro_price("yearly"), 399.00)


@override_settings(ADMIN_EMAILS=["boss@amora.com", "socia@amora.com"])
class AdminByEmailTests(TestCase):
    """Acesso admin controlado pela allowlist ADMIN_EMAILS (via signal)."""

    def test_authorized_email_becomes_staff(self):
        u = User.objects.create(email="boss@amora.com")
        self.assertTrue(u.is_staff)

    def test_unauthorized_email_is_not_staff(self):
        u = User.objects.create(email="maria@gmail.com")
        self.assertFalse(u.is_staff)

    def test_email_match_is_case_insensitive(self):
        u = User.objects.create(email="SOCIA@AMORA.COM")
        self.assertTrue(u.is_staff)

    def test_manual_staff_flag_is_revoked_for_unauthorized(self):
        """Ninguém vira admin marcando is_staff no banco/DevTools."""
        u = User.objects.create(email="hacker@gmail.com")
        u.is_staff = True
        u.is_superuser = True
        u.save()
        u.refresh_from_db()
        self.assertFalse(u.is_staff)
        self.assertFalse(u.is_superuser)