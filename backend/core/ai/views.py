import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.views import has_consent_for_purpose

from .services import query_database_with_llm

logger = logging.getLogger(__name__)


class ChatAskView(APIView):
    """
    Recebe perguntas do usuário e responde via LLM sobre os dados da loja DELE.

    Correções de segurança (P0):
    - permission_classes explícito (não depender do default global em silêncio).
    - `store` sempre extraído de request.user.store — nunca do corpo da
      requisição — e passado para a camada de serviço, que o usa para
      filtrar toda consulta. Isso fecha o vazamento entre lojas.
    - Checa consentimento LGPD para a finalidade 'ai_features' antes de
      processar a pergunta (has_consent_for_purpose existia no código mas
      não era usado em nenhum lugar).
    - Não repassa mais texto de exceção interna (str(e)) para o cliente.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        question = request.data.get("question", "")
        question = question.strip() if isinstance(question, str) else ""

        if not question:
            return Response(
                {"error": "Pergunta inválida ou vazia."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(question) > 500:
            return Response(
                {"error": "Pergunta muito longa (máximo 500 caracteres)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 🔹 Histórico opcional (últimas trocas), pra Amorinha entender
        # perguntas de seguimento tipo "e esse ano?". Vem do frontend, então
        # é tratado como não confiável: só aceita lista, com limite de
        # tamanho — quem sanitiza de verdade (limite de caracteres por
        # mensagem, quantas trocas usar de fato) é o services.py.
        history = request.data.get("history")
        if not isinstance(history, list):
            history = []
        history = history[-6:]  # nunca repassa mais que isso adiante

        store = getattr(request.user, "store", None)
        if store is None:
            return Response(
                {"error": "Nenhuma loja associada a este usuário."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not has_consent_for_purpose(request.user, "ai_features"):
            return Response(
                {"error": "É necessário consentir com o uso de recursos de IA (Amorinha) para usar o assistente."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            answer = query_database_with_llm(question, store, history=history)
            return Response({"response": answer}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Erro no ChatAskView")
            return Response(
                {"error": "Ocorreu um erro ao processar sua pergunta."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )