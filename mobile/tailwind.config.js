/** @type {import('tailwindcss').Config} */
module.exports = {
  // Ajuste os caminhos para bater com a estrutura do React Native
  content: [
    "./App.{js,jsx,ts,tsx}", 
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      // Fontes precisam estar carregadas no projeto (ex: via expo-font)
      fontFamily: {
        sans: ['DMSans_400Regular'], // Nome da fonte carregada no Expo
        display: ['SpaceGrotesk_700Bold'], 
      },
      // Cores convertidas de HSL var() para HEX ou RGB direto
      // NativeWind ainda não suporta var(--variavel) perfeitamente sem configuração extra de tema
      colors: {
        border: "#E2E8F0", // Exemplo de conversão
        input: "#E2E8F0",
        ring: "#F47920",
        background: "#FFFFFF",
        foreground: "#0F172A",
        primary: {
          DEFAULT: "#F47920", // Cor Natura (Laranja)
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#F1F5F9",
          foreground: "#0F172A",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F8FAFC",
          foreground: "#64748B",
        },
        accent: {
          DEFAULT: "#F1F5F9",
          foreground: "#0F172A",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#0F172A",
        },
        // Cores específicas do Chat
        chat: {
          user: "#BFDBFE", // Azul claro
          "user-foreground": "#1E3A8A",
          assistant: "#F3F4F6", // Cinza claro
          "assistant-foreground": "#1F2937",
        },
      },
      borderRadius: {
        lg: "8px", // Valores fixos em pixels
        md: "6px",
        sm: "4px",
      },
    },
  },
  plugins: [], // Plugins web como tailwindcss-animate não funcionam no Native
}