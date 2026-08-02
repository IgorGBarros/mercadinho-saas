import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage'; // Importação correta para mobile
import { api } from "../services/api";

// Interface do Usuário
export interface User {
  id: number;
  email: string;
  name?: string;
  first_name?: string;
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>; // Agora é Promise
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Ao iniciar, verifica se existe token salvo no Storage nativo
    const loadStorageData = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("@NaturaStock:token");
        const storedUser = await AsyncStorage.getItem("@NaturaStock:user");

        if (storedToken && storedUser) {
          // Configura o token no cabeçalho padrão do Axios
          api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error("Erro ao carregar dados do storage:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStorageData();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await api.post("/auth/login/", {
        username: email,
        password: password,
      });

      const { access, refresh } = response.data;

      // Cria objeto de usuário (pode melhorar com jwt-decode se necessário)
      const userData: User = {
        id: 0, // Ajuste conforme resposta real do backend se disponível
        email: email,
        name: "Usuário" // Ajuste conforme resposta real
      };

      // Salva no AsyncStorage (persistência)
      await AsyncStorage.setItem("@NaturaStock:token", access);
      await AsyncStorage.setItem("@NaturaStock:refresh", refresh);
      await AsyncStorage.setItem("@NaturaStock:user", JSON.stringify(userData));

      api.defaults.headers.common["Authorization"] = `Bearer ${access}`;
      setUser(userData);

    } catch (error) {
      console.error("Erro no login:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem("@NaturaStock:token");
      await AsyncStorage.removeItem("@NaturaStock:refresh");
      await AsyncStorage.removeItem("@NaturaStock:user");
      
      delete api.defaults.headers.common["Authorization"];
      setUser(null);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
};