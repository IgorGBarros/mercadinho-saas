# apps/payments/serializers.py
from rest_framework import serializers


class AsaasCheckoutSerializer(serializers.Serializer):
    """Serializer para criar checkout no Asaas"""
    billing_cycle = serializers.ChoiceField(
        choices=['monthly', 'yearly'],
        default='monthly'
    )


class AsaasWebhookSerializer(serializers.Serializer):
    """Serializer para processar webhooks do Asaas"""
    event = serializers.CharField()
    payment = serializers.DictField(required=False)
    subscription = serializers.DictField(required=False)