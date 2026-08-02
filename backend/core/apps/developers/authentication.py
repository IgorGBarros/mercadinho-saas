"""
Autenticação JWT do desenvolvedor — mesma verificação de assinatura do
SimpleJWT (não reinventa a criptografia), mas resolve a identidade contra
DeveloperAccount, nunca contra CustomUser.

Isolamento importante: o token carrega um claim `type: "developer"` que o
token de consultora nunca tem (e vice-versa, o token de desenvolvedor nunca
tem `user_id`, que é o que a autenticação padrão do resto do sistema
procura). Isso significa:

  - Um token de consultora, usado aqui, falha (não tem `type: developer`).
  - Um token de desenvolvedor, usado nas rotas normais do sistema
    (`JWTAuthentication` padrão do DRF SimpleJWT), falha (não tem
    `user_id`, que é o que ela procura).

Ou seja, não é só "duas tabelas diferentes" — é criptograficamente
impossível um token de um produto autenticar no outro.
"""
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import RefreshToken

from .models import DeveloperAccount


def issue_tokens_for_developer(developer: DeveloperAccount) -> dict:
    """Gera o par access/refresh para uma DeveloperAccount específica."""
    refresh = RefreshToken()
    refresh['developer_id'] = str(developer.id)
    refresh['type'] = 'developer'

    access = refresh.access_token
    access['developer_id'] = str(developer.id)
    access['type'] = 'developer'

    return {'access': str(access), 'refresh': str(refresh)}


class DeveloperJWTAuthentication(JWTAuthentication):
    """Use como authentication_classes nas views que só desenvolvedor acessa."""

    def get_user(self, validated_token):
        if validated_token.get('type') != 'developer':
            raise AuthenticationFailed('Este token não é de uma conta de desenvolvedor.')

        developer_id = validated_token.get('developer_id')
        if not developer_id:
            raise AuthenticationFailed('Token de desenvolvedor inválido.')

        try:
            developer = DeveloperAccount.objects.get(id=developer_id)
        except (DeveloperAccount.DoesNotExist, ValueError, TypeError):
            raise AuthenticationFailed('Conta de desenvolvedor não encontrada.')

        if not developer.is_active:
            raise AuthenticationFailed('Conta de desenvolvedor desativada.')

        return developer