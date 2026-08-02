// src/lib/stripe.ts
// Integração com Stripe para assinatura da API

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

// Carregar Stripe.js dinamicamente
export async function loadStripe() {
  if (typeof window === 'undefined') return null;
  
  if (!(window as any).Stripe) {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    document.body.appendChild(script);
    
    await new Promise<void>((resolve) => {
      script.onload = () => resolve();
    });
  }
  
  return (window as any).Stripe(STRIPE_PUBLISHABLE_KEY);
}

// Criar sessão de checkout
export async function createCheckoutSession(plan: 'starter' | 'pro' | 'enterprise') {
  const response = await fetch('/api/stripe/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao criar sessão');
  }
  
  return response.json();
}

// Tipos
export interface CheckoutSession {
  id: string;
  url: string;
  client_secret: string;
}

export interface Subscription {
  id: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  plan: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

// Gerenciar assinatura do usuário
export const subscriptionApi = {
  get: async (): Promise<Subscription | null> => {
    const response = await fetch('/api/stripe/subscription');
    if (!response.ok) return null;
    return response.json();
  },
  
  cancel: async () => {
    const response = await fetch('/api/stripe/subscription', {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro ao cancelar');
    }
    return response.json();
  },
  
  update: async (data: { plan?: string; cancel_at_period_end?: boolean }) => {
    const response = await fetch('/api/stripe/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro ao atualizar');
    }
    return response.json();
  },
};