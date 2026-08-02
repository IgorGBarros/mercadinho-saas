// contexts/ThemeContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { themeApi, ThemeConfig } from '../lib/api';
import { hexToHSL, getContrastColor } from '../lib/colorUtils';

interface ThemeContextValue {
  theme: ThemeConfig | null;
  loading: boolean;
  refreshTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  loading: true,
  refreshTheme: async () => {},
});

// Valores padrão (fallback se API falhar)
const DEFAULT_THEME: ThemeConfig = {
  color_primary: '#871745',
  color_primary_light: '#FDF2F7',
  color_success: '#871745',
  color_text: '#2D292E',
  color_accent: '#A91B60',
  color_destructive: '#DC2626',
  color_warning: '#F59E0B',
  color_background: '#FFFFFF',
  color_card: '#FFFFFF',
  color_border: '#E5E7EB',
  app_name: 'Minha Amora',
  logo_url: null,
  updated_at: '',
};

/**
 * Aplica as cores do tema como CSS Custom Properties no :root
 */
function applyThemeToDOM(theme: ThemeConfig) {
  const root = document.documentElement;
  
  // Cores principais (formato HSL para Tailwind/shadcn)
  root.style.setProperty('--primary', hexToHSL(theme.color_primary));
  root.style.setProperty('--primary-foreground', hexToHSL(getContrastColor(theme.color_primary)));
  
  // Accent
  root.style.setProperty('--accent', hexToHSL(theme.color_accent));
  root.style.setProperty('--accent-foreground', hexToHSL(getContrastColor(theme.color_accent)));
  
  // Destructive
  root.style.setProperty('--destructive', hexToHSL(theme.color_destructive));
  root.style.setProperty('--destructive-foreground', '0 0% 100%');
  
  // Background & Card
  root.style.setProperty('--background', hexToHSL(theme.color_background));
  root.style.setProperty('--card', hexToHSL(theme.color_card));
  root.style.setProperty('--card-foreground', hexToHSL(theme.color_text));
  
  // Border
  root.style.setProperty('--border', hexToHSL(theme.color_border));
  root.style.setProperty('--input', hexToHSL(theme.color_border));
  
  // Foreground (texto)
  root.style.setProperty('--foreground', hexToHSL(theme.color_text));
  
  // Variáveis RAW em HEX (para uso direto em gradientes, etc.)
  root.style.setProperty('--color-primary-hex', theme.color_primary);
  root.style.setProperty('--color-primary-light-hex', theme.color_primary_light);
  root.style.setProperty('--color-success-hex', theme.color_success);
  root.style.setProperty('--color-accent-hex', theme.color_accent);
  root.style.setProperty('--color-text-hex', theme.color_text);
  
  // Meta tag (cor da barra do navegador mobile)
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme.color_primary);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTheme = async () => {
    try {
      const data = await themeApi.get();
      setTheme(data);
      applyThemeToDOM(data);
      
      // Cache no localStorage para carregamento instantâneo
      localStorage.setItem('app_theme', JSON.stringify(data));
    } catch (error) {
      console.warn('⚠️ Falha ao carregar tema da API, usando cache/padrão');
      
      // Tentar cache
      const cached = localStorage.getItem('app_theme');
      if (cached) {
        const cachedTheme = JSON.parse(cached);
        setTheme(cachedTheme);
        applyThemeToDOM(cachedTheme);
      } else {
        setTheme(DEFAULT_THEME);
        applyThemeToDOM(DEFAULT_THEME);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Aplicar cache imediatamente (evita flash de cores erradas)
    const cached = localStorage.getItem('app_theme');
    if (cached) {
      try {
        applyThemeToDOM(JSON.parse(cached));
      } catch {}
    }
    
    refreshTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, loading, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);