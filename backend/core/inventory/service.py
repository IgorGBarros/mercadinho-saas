# inventory/services.py - NOVO serviço de alertas

from requests import Response

from backend.core.inventory.models import InventoryBatch, InventoryItem
from backend.core.inventory.utils import get_current_store
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
class ExpiryAlertService:
    """Serviço para gerenciar alertas de validade"""
    
    @staticmethod
    def get_expiry_alerts(store):
        """Retorna alertas de produtos próximos ao vencimento"""
        from datetime import datetime, timedelta
        
        today = datetime.now().date()
        
        # Buscar lotes críticos
        critical_batches = InventoryBatch.objects.filter(
            item__store=store,
            quantity__gt=0,
            expiration_date__isnull=False,
            expiration_date__lte=today + timedelta(days=30)
        ).select_related('item__product').order_by('expiration_date')
        
        alerts = {
            'expired': [],      # Vencidos
            'critical': [],     # <= 7 dias
            'warning': [],      # <= 30 dias
            'total_value_at_risk': 0
        }
        
        for batch in critical_batches:
            days_to_expire = (batch.expiration_date - today).days
            
            alert_item = {
                'product_name': batch.item.product.name,
                'batch_id': batch.id,
                'quantity': batch.quantity,
                'expiration_date': batch.expiration_date,
                'days_to_expire': days_to_expire,
                'estimated_value': batch.quantity * (batch.item.sale_price or 0)
            }
            
            if days_to_expire <= 0:
                alerts['expired'].append(alert_item)
            elif days_to_expire <= 7:
                alerts['critical'].append(alert_item)
            else:
                alerts['warning'].append(alert_item)
            
            alerts['total_value_at_risk'] += alert_item['estimated_value']
        
        return alerts
    
    @staticmethod
    def auto_prioritize_expiring_products(store):
        """Prioriza produtos próximos ao vencimento nas vendas"""
        from datetime import datetime, timedelta
        
        today = datetime.now().date()
        
        # Buscar produtos com lotes próximos ao vencimento
        expiring_items = InventoryItem.objects.filter(
            store=store,
            batches__quantity__gt=0,
            batches__expiration_date__lte=today + timedelta(days=7)
        ).distinct()
        
        priority_products = []
        for item in expiring_items:
            # Encontrar o lote mais próximo do vencimento
            nearest_batch = item.batches.filter(
                quantity__gt=0,
                expiration_date__lte=today + timedelta(days=7)
            ).order_by('expiration_date').first()
            
            if nearest_batch:
                days_left = (nearest_batch.expiration_date - today).days
                priority_products.append({
                    'product_id': item.product.id,
                    'product_name': item.product.name,
                    'quantity_at_risk': nearest_batch.quantity,
                    'days_left': days_left,
                    'urgency': 'critical' if days_left <= 3 else 'warning'
                })
        
        return sorted(priority_products, key=lambda x: x['days_left'])

# inventory/views.py - ADICIONAR endpoint de alertas

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def expiry_alerts_view(request):
    """Endpoint para alertas de validade"""
    try:
        store = get_current_store(request.user)
        alerts = ExpiryAlertService.get_expiry_alerts(store)
        priority_products = ExpiryAlertService.auto_prioritize_expiring_products(store)
        
        return Response({
            'alerts': alerts,
            'priority_products': priority_products,
            'summary': {
                'total_expired': len(alerts['expired']),
                'total_critical': len(alerts['critical']),
                'total_warning': len(alerts['warning']),
                'value_at_risk': alerts['total_value_at_risk']
            }
        })
        
    except Exception as e:
        return Response({'error': str(e)}, status=500)