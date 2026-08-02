import { api } from "../services/api";

// --- INTERFACES --- (Mantidas iguais)
export interface Product {
  id?: number;
  name: string;
  bar_code: string;
  natura_sku?: string;
  category: string;
  price: number;
  sale_price?: number;
  official_price?: number;
  cost_price: number;
  min_quantity: number;
  description: string;
  image_url?: string;
  quantity: number;
  batch_code?: string;
  expiration_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LookupData {
  local?: Product;
  remote?: {
    name: string;
    sale_price: number;
    description: string;
    bar_code: string;
  };
  price_diff?: boolean;
  msg?: string;
  candidates?: Product[]; // Adicionado para suportar lista de sugestões
  google_name?: string;
}

export interface ProductLookupResponse {
  found: boolean;
  source: 'local' | 'remote' | 'remote_learned' | 'remote_partial' | 'suggestion' | null;
  data: LookupData | Partial<Product>;
  candidates?: Product[];
  google_name?: string;
  message?: string;
}

// --- CONFIGURAÇÃO API ---
// @ts-ignore
// Base da API definida pelo ambiente, com fallback
const API_BASE_URL =(import.meta as env)?.VITE_API_BASE_URL || "https://gestao-estoque-k5vy.onrender.com";

/**
 * Faz requisições REST para o backend Django.
 * Adiciona automaticamente o token salvo em localStorage (se existir).
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("auth_token");

  // monta cabeçalhos
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    // ⚠️ CORREÇÃO: era `Token ${token}`. O backend (SimpleJWT) espera o
    // esquema "Bearer", e o ApiKeyMiddleware trata QUALQUER header que não
    // comece com "Bearer " como ausência de credencial — bloqueando com 401
    // "API Key ausente" mesmo em endpoints públicos. Antes do middleware
    // existir isso era inofensivo (o header malformado era simplesmente
    // ignorado e a requisição seguia anônima); agora quebra a busca de
    // produto ao cadastrar.
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API Error ${response.status}: ${errorText || response.statusText}`
      );
    }

    // sem conteúdo
    if (response.status === 204) {
      return null as T;
    }

    // resposta JSON normal
    return (await response.json()) as T;
  } catch (error) {
    console.error(`Falha na requisição: ${endpoint}`, error);
    throw error;
  }
}
// --- SERVICE REAL ---
export const productService = {
  
  // 1. LISTAR TODOS
  list: async () => {
    const data = await apiRequest<Product[]>("/api/products/");
    return data.map(p => ({ 
      ...p, 
      price: p.sale_price || p.price || 0 
    }));
  },

  // 2. PEGAR UM
  get: async (id: number) => {
    const data = await apiRequest<Product>(`/api/products/${id}/`);
    return { ...data, price: data.sale_price || data.price || 0 };
  },

  // 3. BUSCA POR CÓDIGO DE BARRAS (EAN)
  lookupByEan: async (ean: string) => {
    return apiRequest<ProductLookupResponse>(`/api/products/lookup/?ean=${ean}`);
  },

  // 3.1 NOVO: BUSCA POR NOME (Autocomplete)
  lookupByName: async (name: string) => {
    // Usa o parâmetro 'q' que o backend já trata como busca textual/fuzzy
    return apiRequest<ProductLookupResponse>(`/api/products/lookup/?q=${encodeURIComponent(name)}`);
  },

  // 3.2 NOVO: BUSCA POR SKU NATURA
  lookupBySku: async (sku: string) => {
    // O backend trata 'q' ou 'ean'. Se passar SKU no 'q', ele busca em 'natura_sku'
    return apiRequest<ProductLookupResponse>(`/api/products/lookup/?q=${sku}`);
  },

  // 4. ENTRADA DE ESTOQUE (Cria produto se necessário)
  addStock: async (data: any) => {
    return apiRequest("/stock/entry/", {
      method: "POST",
      body: JSON.stringify({
        bar_code: data.bar_code,
        quantity: data.quantity,
        sale_price: data.price,
        cost_price: data.cost_price,
        batch_code: data.batch_code,
        expiration_date: data.expiration_date,
        // Envia nome/sku para criação automática caso não exista
        name: data.name,
        natura_sku: data.natura_sku,
        category: data.category
      })
    });
  },

  // 5. ATUALIZAR
  update: async (id: number, product: Partial<Product>) => {
    return apiRequest<Product>(`/api/products/${id}/`, { 
      method: "PATCH", 
      body: JSON.stringify({ 
        ...product, 
        sale_price: product.price 
      }) 
    });
  },

  // 6. DELETAR
  delete: async (id: number) => {
    return apiRequest<void>(`/api/products/${id}/`, { method: "DELETE" });
  },

  // 7. COMPATIBILIDADE
  getByBarcode: async (barcode: string) => {
    const res = await apiRequest<ProductLookupResponse>(`/api/products/lookup/?ean=${barcode}`);
    if (res.found && res.source === 'local') {
        const data = res.data as LookupData;
        return data.local as Product;
    }
    throw new Error("Produto não encontrado.");
  },
  
  create: async (product: Omit<Product, "id">) => {
      // Mantido para compatibilidade, mas o ideal é usar addStock
      return productService.addStock(product);
  }
};