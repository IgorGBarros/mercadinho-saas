# backend/core/inventory/apps.py
from django.apps import AppConfig

class InventoryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inventory'

    def ready(self):
        # Importa os signals assim que o app Inventory for carregado
        import inventory.signals # noqa