from django.contrib import admin
from .models import Product, Store, InventoryItem, InventoryBatch, Sale, SaleItem, CrawlerLog

# Configuração para facilitar visualização
class InventoryBatchInline(admin.TabularInline):
    model = InventoryBatch
    extra = 0

class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ('product', 'store', 'total_quantity', 'sale_price')
    inlines = [InventoryBatchInline] # Mostra os lotes dentro do item

class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0

class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'store', 'transaction_type', 'total_amount', 'created_at')
    inlines = [SaleItemInline]

admin.site.register(Product)
admin.site.register(Store)
admin.site.register(InventoryItem, InventoryItemAdmin)
admin.site.register(Sale, SaleAdmin)
admin.site.register(CrawlerLog)