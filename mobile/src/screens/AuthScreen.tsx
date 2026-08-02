import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView
} from "react-native";
import { Package, Mail, Lock, User, Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "../hooks/useAuth"; // Precisa ser adaptado para mobile
import { api } from "../services/api";
// Se usar react-navigation, descomente abaixo
// import { useNavigation } from "@react-navigation/native";

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn } = useAuth();
  // const navigation = useNavigation();

  const handleSubmit = async () => {
    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN ---
        await signIn(email, password);
        // A navegação geralmente é automática via Contexto (se user != null, muda a stack)
      } else {
        // --- CADASTRO ---
        await api.post("/auth/register/", {
          username: email,
          email: email,
          password: password,
          first_name: name,
        });

        Alert.alert("Sucesso", "Conta criada com sucesso! Faça login para continuar.");
        setIsLogin(true);
      }
    } catch (err: any) {
      console.error(err);
      let msg = "Falha na autenticação.";
      
      if (err.response) {
        if (err.response.status === 401) msg = "Credenciais inválidas.";
        else if (err.response.data?.detail) msg = err.response.data.detail;
        else if (err.response.data?.username) msg = "Este usuário já existe.";
      } else if (err.message) {
        msg = "Erro de conexão. Verifique sua internet.";
      }

      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    Alert.alert("Em breve", "Login social estará disponível nas próximas atualizações.");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Package color="#F47920" size={32} />
            </View>
            <Text style={styles.title}>Estoque Natura</Text>
            <Text style={styles.subtitle}>
              {isLogin ? "Entre na sua conta" : "Crie sua conta"}
            </Text>
          </View>

          <TouchableOpacity onPress={handleGoogleLogin} style={styles.googleButton}>
             {/* Simulação de ícone do Google */}
            <View style={styles.googleIconPlaceholder} /> 
            <Text style={styles.googleButtonText}>Entrar com Google</Text>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <User color="#6B7280" size={20} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Seu nome"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Mail color="#6B7280" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock color="#6B7280" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <EyeOff color="#6B7280" size={20} />
                ) : (
                  <Eye color="#6B7280" size={20} />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLogin ? "Entrar" : "Criar Conta"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isLogin ? "Não tem conta? " : "Já tem conta? "}
            </Text>
            <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.footerLink}>
                {isLogin ? "Criar conta" : "Fazer login"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FFF7ED",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 24,
  },
  googleIconPlaceholder: {
    width: 20, 
    height: 20, 
    backgroundColor: '#4285F4', 
    borderRadius: 10, 
    marginRight: 8 
  },
  googleButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    color: "#6B7280",
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: "#111827",
  },
  submitButton: {
    backgroundColor: "#F47920", // Cor da Natura
    borderRadius: 12,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#6B7280",
  },
  footerLink: {
    fontSize: 14,
    color: "#F47920",
    fontWeight: "600",
  },
});