// lib/cart.ts
import { api } from "../services/api";

export interface CartItemInput {
  inventory_id: string;
  product_name: string;
  quantity: number;
  price_snapshot: number;
}

export interface PersistCartInput {
  tenant_id: string;
  session_id: string;
  lead_id?: string; // opcional para visitantes
  checked_out: boolean;
  items: CartItemInput[];
  // 💳 O que a cliente escolheu na vitrine antes de mandar a mensagem —
  // vai junto só quando checked_out=true (é o momento do envio de verdade).
  payment_method?: "pix" | "cartao";
  whatsapp_message?: string;
}

// 🔹 Gera ou recupera session_id único por loja/visitante
export function getOrCreateSessionId(storeSlug: string): string {
  const key = `session_${storeSlug}`;
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = `${storeSlug}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

// 🔹 Persiste carrinho no backend para analytics/CRM
export async function persistCart(input: PersistCartInput): Promise<void> {
  await api.post("/crm/carts/persist", input);
}