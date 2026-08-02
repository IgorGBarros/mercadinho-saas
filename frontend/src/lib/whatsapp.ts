// WhatsApp link & message-template engine for the CRM
// Variables: {name}, {product}, {link}, {discount}, {seller}

export type WaTemplateKey =
  | "welcome"
  | "abandoned_cart"
  | "birthday"
  | "promotion"
  | "custom";

export interface WaTemplate {
  key: WaTemplateKey;
  label: string;
  body: string;
}

export const WA_TEMPLATES: WaTemplate[] = [
  {
    key: "welcome",
    label: "Boas-vindas",
    body:
      "Olá {name}! 😊 Aqui é a {seller}. Obrigada por visitar minha vitrine! Estou à disposição para te ajudar a escolher os melhores produtos. 💚",
  },
  {
    key: "abandoned_cart",
    label: "Carrinho abandonado",
    body:
      "Oi {name}! 🛍️ Notei que você deixou alguns produtos na sua sacola na minha vitrine. Posso te ajudar a finalizar? {link}",
  },
  {
    key: "birthday",
    label: "Aniversário",
    body:
      "🎉 Feliz aniversário, {name}! Para comemorar com você, separei um mimo especial: {discount}. Aproveite!",
  },
  {
    key: "promotion",
    label: "Promoção",
    body:
      "Olá {name}! ✨ Tenho uma promoção especial em {product} — {discount}. Quer saber mais? 💚",
  },
  {
    key: "custom",
    label: "Mensagem personalizada",
    body: "Olá {name}! 💚",
  },
];

export function renderTemplate(
  body: string,
  vars: Record<string, string | undefined>
): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export function sanitizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

export function buildWaLink(
  phone: string,
  body: string,
  vars: Record<string, string | undefined> = {}
): string {
  const clean = sanitizePhone(phone);
  const text = encodeURIComponent(renderTemplate(body, vars));
  return `https://wa.me/${clean}?text=${text}`;
}
