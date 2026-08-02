from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
import re

from .models import DeveloperAccount


class DeveloperRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(max_length=150)
    company_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if DeveloperAccount.objects.filter(email=value).exists():
            raise serializers.ValidationError("Já existe uma conta de desenvolvedor com este e-mail.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))

        # ⚠️ Django, por padrão, só rejeita senha 100% numérica — não exige
        # letra, número e caractere especial juntos. Adicionado à parte
        # porque é essa a regra que faz sentido comunicar de forma clara
        # na tela de cadastro (alfanumérico + caractere especial).
        if not re.search(r'[A-Za-z]', value):
            raise serializers.ValidationError("A senha precisa ter pelo menos uma letra.")
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError("A senha precisa ter pelo menos um número.")
        if not re.search(r'[^A-Za-z0-9]', value):
            raise serializers.ValidationError("A senha precisa ter pelo menos um caractere especial (ex: !@#$%&*).")

        return value


class DeveloperLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class DeveloperAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeveloperAccount
        fields = ['id', 'email', 'name', 'company_name', 'created_at', 'last_login_at']
        read_only_fields = fields