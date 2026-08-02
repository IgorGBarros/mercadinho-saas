import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TextInput, TouchableOpacity, 
  ScrollView, KeyboardAvoidingView, Platform, Dimensions, Modal 
} from 'react-native';
import { MessageCircle, X, Send, Bot, User, Sparkles } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { api } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Instalar se não tiver

// Tipagem
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  "Quantos Kaiak eu tenho?",
  "Quais produtos estão acabando?",
  "Qual o valor total do estoque?",
  "Quais os mais vendidos?",
];

const { height } = Dimensions.get('window');

export const ChatAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);

  // Carregar histórico
  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem("chatHistory");
        if (data) {
            setMessages(JSON.parse(data).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
        } else {
            setMessages([{
                id: "welcome",
                role: "assistant",
                content: "Olá! 👋 Sou seu assistente de estoque Natura. Pergunte sobre quantidades, valores ou produtos em falta!",
                timestamp: new Date(),
            }]);
        }
      } catch {}
    })();
  }, []);

  // Salvar histórico
  useEffect(() => {
    if (messages.length > 0) {
        AsyncStorage.setItem("chatHistory", JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll automático
  useEffect(() => {
    if (isOpen) {
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isOpen]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      console.log("Enviando pergunta:", msg);
      const res = await api.post("chat/ask/", { question: msg });
      
      const answerText = res.data.response || JSON.stringify(res.data);
      
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: answerText,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error("Erro no chat:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "⚠️ Ocorreu um erro ao contatar o assistente IA.",
          timestamp: new Date(),
        },
      ]);
    }
    setIsLoading(false);
  };

  return (
    <>
      {/* Botão Flutuante (FAB) */}
      {!isOpen && (
        <Animated.View 
            entering={FadeIn} 
            exiting={FadeOut} 
            style={styles.fabContainer}
        >
          <TouchableOpacity 
            style={styles.fab} 
            onPress={() => setIsOpen(true)}
            activeOpacity={0.8}
          >
            <MessageCircle color="white" size={28} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Modal do Chat */}
      <Modal
        visible={isOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsOpen(false)}
      >
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
        >
          <Animated.View 
            entering={SlideInDown} 
            exiting={SlideOutDown} 
            style={styles.chatContainer}
          >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                    <View style={styles.aiIconContainer}>
                        <Sparkles color="#F47920" size={20} />
                    </View>
                    <View>
                        <Text style={styles.headerTitle}>Assistente Natura</Text>
                        <Text style={styles.headerSubtitle}>Estoque inteligente</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeButton}>
                    <X color="#666" size={24} />
                </TouchableOpacity>
            </View>

            {/* Mensagens */}
            <ScrollView 
                ref={scrollViewRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
            >
                {messages.map((msg) => (
                    <View 
                        key={msg.id} 
                        style={[
                            styles.messageRow, 
                            msg.role === 'user' ? styles.userRow : styles.assistantRow
                        ]}
                    >
                        {msg.role === 'assistant' && (
                            <View style={styles.avatarContainer}>
                                <Bot color="#F47920" size={16} />
                            </View>
                        )}
                        
                        <View style={[
                            styles.bubble, 
                            msg.role === 'user' ? styles.userBubble : styles.assistantBubble
                        ]}>
                            <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>
                                {msg.content}
                            </Text>
                        </View>

                        {msg.role === 'user' && (
                            <View style={[styles.avatarContainer, { backgroundColor: '#E5E7EB' }]}>
                                <User color="#374151" size={16} />
                            </View>
                        )}
                    </View>
                ))}

                {isLoading && (
                    <View style={styles.loadingContainer}>
                         <View style={styles.avatarContainer}>
                                <Bot color="#F47920" size={16} />
                        </View>
                        <View style={[styles.bubble, styles.assistantBubble]}>
                             <Text style={styles.assistantText}>Digitando...</Text>
                        </View>
                    </View>
                )}

                {/* Sugestões (apenas se tiver poucas mensagens) */}
                {messages.length <= 1 && !isLoading && (
                    <View style={styles.suggestionsContainer}>
                        {SUGGESTIONS.map((s) => (
                            <TouchableOpacity 
                                key={s} 
                                style={styles.suggestionChip}
                                onPress={() => handleSend(s)}
                            >
                                <Text style={styles.suggestionText}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Pergunte sobre seu estoque..."
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={() => handleSend()}
                />
                <TouchableOpacity 
                    onPress={() => handleSend()} 
                    disabled={isLoading || !input.trim()}
                    style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                >
                    <Send color="white" size={20} />
                </TouchableOpacity>
            </View>

          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 50,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F47920', // Primary Natura Color
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F47920',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  chatContainer: {
    backgroundColor: 'white',
    height: height * 0.8, // 80% da tela
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFF',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF1E7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  closeButton: {
    padding: 4,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
    gap: 8,
    maxWidth: '85%',
  },
  userRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  assistantRow: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF1E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#BFDBFE', // Azul claro
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userText: {
    color: '#1E3A8A',
    fontSize: 14,
  },
  assistantText: {
    color: '#374151',
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  suggestionText: {
    fontSize: 12,
    color: '#4B5563',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: 'white',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F47920',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});