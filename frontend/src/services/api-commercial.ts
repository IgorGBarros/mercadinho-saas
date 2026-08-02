// src/services/api-commercial.ts - NOVO ARQUIVO

import axios from "axios";

// Instância específica para API comercial (com API Key)
export const apiCommercial = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL}/api/v1`,
  headers: { 
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  timeout: 30000,
});

// Interceptor para adicionar API Key automaticamente
apiCommercial.interceptors.request.use(
  (config) => {
    const apiKey = import.meta.env.VITE_API_GATEWAY_KEY;
    if (apiKey) {
      config.headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Exportar para uso em componentes que precisam da API comercial
export default apiCommercial;