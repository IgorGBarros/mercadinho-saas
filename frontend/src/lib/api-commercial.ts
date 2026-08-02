// src/lib/api-commercial.ts
// Client para a API comercial (api.minhaamora.com.br)

const API_COMMERCIAL_BASE = import.meta.env.VITE_API_COMMERCIAL_URL 
  || 'https://api.minhaamora.com.br/api/v1';

// Tipos
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  plan: 'starter' | 'pro' | 'enterprise';
  scopes: string[];
  rate_limit: number;
  monthly_quota: number;
  last_used: string | null;
  is_active: boolean;
}

export interface ApiUsage {
  requests_30d: number;
  quota: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  category: string;
  official_price: number | null;
  bar_code: string | null;
  image_url: string | null;
  description: string | null;
}

export interface LookupResult {
  found: boolean;
  source: 'local' | 'remote' | 'suggestion';
  product?: Product;
  suggestions?: Product[];
  message?: string;
}

// Função base para requests
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = localStorage.getItem('api_key_demo');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  const response = await fetch(`${API_COMMERCIAL_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro ${response.status}`);
  }
  
  if (response.status === 204) return null as T;
  
  return response.json();
}

// Endpoints da API Comercial
export const commercialApi = {
  // Catálogo
  listProducts: (params?: { brand?: string; category?: string; page?: number }) => 
    apiRequest<{ results: Product[]; count: number; next?: string }>(
      `/products/${params ? '?' + new URLSearchParams(params as any).toString() : ''}`
    ),
  
  lookupByBarcode: (barcode: string) => 
    apiRequest<LookupResult>(`/products/lookup/?barcode=${encodeURIComponent(barcode)}`),
  
  // Storefront Pública
  getStorefront: (slug: string) => 
    apiRequest<any[]>(`/public/storefront/${slug}/`),
  
  // Analytics (Enterprise)
  getAnalytics: () => 
    apiRequest<any>('/analytics/products/'),
  
  // Dashboard do Desenvolvedor
  listKeys: () => apiRequest<ApiKey[]>('/dashboard/keys/'),
  createKey: (data: { name: string; plan: string; scopes: string[] }) => 
    apiRequest<ApiKey>('/dashboard/keys/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  revokeKey: (keyId: string) => 
    apiRequest<void>(`/dashboard/keys/${keyId}/`, { method: 'DELETE' }),
  
  getUsage: () => apiRequest<ApiUsage>('/dashboard/usage/'),
  
  // Webhooks
  listWebhooks: () => apiRequest<any[]>('/dashboard/webhooks/'),
  createWebhook: (data: { url: string; events: string[] }) => 
    apiRequest<any>('/dashboard/webhooks/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Utilitários
export const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatNumber = (value: number) => 
  new Intl.NumberFormat('pt-BR').format(value);