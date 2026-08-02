from typing import Literal
from langchain_community.llms import Ollama

# Catálogo de modelos suportados
MODELS = {
    "fast": "qwen2.5:14b",
    "standard": "mistral-nemo:14b",
    "report": "deepseek-r1:14b",
}

def select_model(user_question: str) -> Literal["fast", "standard", "report"]:
    """
    Avalia o tipo de pergunta e retorna a categoria de modelo ideal.
    """
    q = user_question.lower()

    # Perguntas objetivas / numéricas → Qwen
    if any(k in q for k in ["quantos", "total", "valor", "preço", "unidades"]):
        return "fast"

    # Relatórios / análises → DeepSeek
    if any(k in q for k in [
        "análise", "detalhado", "explicar", "diferença", 
        "por que", "resumo", "relatório"
    ]):
        return "report"

    # Conversas gerais / ajuda → Mistral-Nemo
    return "standard"


def get_llm(user_question: str):
    """
    Retorna uma instância de Ollama configurada com base na categoria.
    """
    category = select_model(user_question)
    model_name = MODELS[category]

    # Parâmetros por tipo
    configs = {
        "fast": dict(temperature=0.25, num_ctx=2048),
        "standard": dict(temperature=0.3, num_ctx=4096, top_p=0.9),
        "report": dict(temperature=0.2, num_ctx=4096, top_p=0.8)
    }

    return Ollama(model=model_name, **configs[category])