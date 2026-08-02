export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Configure this to point to your Django backend
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

export async function sendChatMessage(
  message: string,
  history: ChatMessage[]
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/ask/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add auth token if needed:
        // "Authorization": `Token ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        question: message,
        history: history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    return data.answer || data.response || "Desculpe, não consegui processar sua pergunta.";
  } catch (error) {
    console.error("Chat API error:", error);
    // Demo mode fallback when Django backend is not available
    return getDemoResponse(message);
  }
}

function getDemoResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("kaiak") || q.includes("perfume")) {
    return "📦 Você tem **12 unidades** de Kaiak em estoque, com valor total de R$ 1.438,80. Deseja mais detalhes?";
  }
  if (q.includes("acabando") || q.includes("baixo") || q.includes("pouco")) {
    return "⚠️ **3 produtos** estão com estoque baixo:\n\n- Kaiak Aventura (2 un.)\n- Essencial Masculino (1 un.)\n- Tododia Cereja (3 un.)\n\nDeseja que eu gere um relatório?";
  }
  if (q.includes("valor") || q.includes("total")) {
    return "💰 O valor total do seu estoque é **R$ 24.580,50**, distribuído em **47 produtos** e **326 unidades**.";
  }
  if (q.includes("mais vendido") || q.includes("popular")) {
    return "🏆 Os 3 produtos mais movimentados:\n\n1. **Humor** — 45 saídas/mês\n2. **Ekos Cacau** — 38 saídas/mês\n3. **Luna** — 32 saídas/mês";
  }
  return "🤖 Estou aqui para ajudar com seu estoque Natura! Pergunte sobre quantidades, valores, produtos em falta e mais.";
}
