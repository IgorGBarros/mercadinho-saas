import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, 
  Switch, ActivityIndicator, Alert, Linking 
} from 'react-native';
import { ArrowLeft, Save, LogOut, Copy, Check, ExternalLink } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../hooks/useAuth'; 
import { api } from '../services/api';
// Se estiver usando react-native-toast-message, importe aqui. Usarei Alert para simplificar.

export default function SettingsScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [form, setForm] = useState({
    display_name: "",
    whatsapp_number: "",
    storefront_enabled: false,
    slug: "" 
  });

  // 1. Carregar dados
  useEffect(() => {
    if (!user) return;
    const fetchStoreSettings = async () => {
      try {
        const { data } = await api.get("/store/settings/");
        setForm({
          display_name: data.name || "",
          whatsapp_number: data.whatsapp || "",
          storefront_enabled: true, // Assumindo true para MVP
          slug: data.slug || ""
        });
      } catch (error) {
        console.error(error);
        Alert.alert("Erro", "Não foi possível carregar os dados.");
      } finally {
        setLoading(false);
      }
    };
    fetchStoreSettings();
  }, [user]);

  // 2. Salvar dados
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/store/settings/", {
        name: form.display_name,
        whatsapp: form.whatsapp_number,
      });
      Alert.alert("Sucesso", "Configurações salvas!");
    } catch (error: any) {
      const msg = error.response?.data?.detail || "Falha ao salvar.";
      Alert.alert("Erro", msg);
    } finally {
      setSaving(false);
    }
  };

  // URL da Vitrine (Simulada, pois app não tem window.location)
  // Em produção, coloque a URL do seu site frontend
  const WEB_URL = "https://seu-app-natura.vercel.app"; 
  const storeIdentifier = form.slug || user?.id; 
  const storefrontUrl = `${WEB_URL}/vitrine/${storeIdentifier}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(storefrontUrl);
    setCopied(true);
    // Toast.show({ type: 'success', text1: 'Link copiado!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const openLink = () => {
    Linking.openURL(storefrontUrl);
  };

  const handleLogout = async () => {
    await signOut();
    // A navegação deve ser tratada pelo AuthStack automaticamente ao limpar o user
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F47920" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color="#666" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configurações</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados da Loja</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome da Loja</Text>
            <TextInput
              style={styles.input}
              value={form.display_name}
              onChangeText={(t) => setForm(p => ({ ...p, display_name: t }))}
              placeholder="Ex: Consultoria da Maria"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>WhatsApp (com DDD)</Text>
            <TextInput
              style={styles.input}
              value={form.whatsapp_number}
              onChangeText={(t) => setForm(p => ({ ...p, whatsapp_number: t }))}
              placeholder="5511999999999"
              keyboardType="phone-pad"
              placeholderTextColor="#999"
            />
            <Text style={styles.helperText}>Usado para receber pedidos.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email da Conta</Text>
            <Text style={styles.staticText}>{user?.email}</Text>
          </View>
        </View>

        {/* Vitrine */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vitrine Digital</Text>
          
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.rowTitle}>Status da Vitrine</Text>
              <Text style={styles.rowSubtitle}>Permitir acesso público</Text>
            </View>
            <Switch
              value={form.storefront_enabled}
              onValueChange={(v) => setForm(p => ({ ...p, storefront_enabled: v }))}
              trackColor={{ false: "#767577", true: "#F47920" }}
              thumbColor={form.storefront_enabled ? "#fff" : "#f4f3f4"}
            />
          </View>

          {form.storefront_enabled && (
            <View style={styles.linkContainer}>
              <Text style={styles.label}>Link para compartilhar:</Text>
              <View style={styles.linkRow}>
                <TextInput
                  editable={false}
                  value={storefrontUrl}
                  style={[styles.input, styles.linkInput]}
                />
                <TouchableOpacity onPress={copyLink} style={styles.iconBtn}>
                  {copied ? <Check size={20} color="#F47920" /> : <Copy size={20} color="#666" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={openLink} style={styles.iconBtn}>
                  <ExternalLink size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Botões */}
        <TouchableOpacity 
          onPress={handleSave} 
          disabled={saving}
          style={[styles.saveButton, saving && styles.disabledButton]}
        >
          {saving ? (
             <ActivityIndicator color="#FFF" />
          ) : (
             <>
               <Save size={20} color="#FFF" />
               <Text style={styles.saveButtonText}>Salvar Alterações</Text>
             </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Sair da Conta</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // background
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: 50, // Safe Area
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  content: {
    padding: 16,
    gap: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  staticText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginTop: 4,
  },
  helperText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  linkContainer: {
    marginTop: 8,
    gap: 4,
  },
  linkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
  },
  iconBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  saveButton: {
    backgroundColor: '#F47920', // Primary
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '500',
    fontSize: 14,
  },
});