// components/ChatAssistant.tsx — VERSÃO REFATORADA COM PALETA DA MARCA
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, User } from "lucide-react";
import { api } from "../services/api";
import amorinhaAvatar from "../assets/amorinha-avatar.png";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  "Quantos Kaiak eu tenho?",
  "Quais produtos estão acabando?",
  "Qual o valor total do estoque?",
  "Quais os mais vendidos?",
];

export const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const data = localStorage.getItem("chatHistory");
      if (data)
        return JSON.parse(data).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
    } catch (_) {}
    return [
      {
        id: "welcome",
        role: "assistant",
        content:
          "Olá! 👋 Sou a Amorinha, sua assistente de estoque. Pergunte sobre quantidades, valores ou produtos em falta! 💜",
        timestamp: new Date(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    localStorage.setItem("chatHistory", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 🔹 Monta o histórico das últimas trocas (pergunta+resposta), pra
      // Amorinha entender perguntas de seguimento como "e esse ano?". Usa
      // `messages` de ANTES de adicionar a pergunta atual — pega só pares
      // completos (usuário seguido de resposta da assistente).
      const historico: { question: string; answer: string }[] = [];
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].role === "user" && messages[i + 1].role === "assistant") {
          historico.push({ question: messages[i].content, answer: messages[i + 1].content });
        }
      }

      const res = await api.post("chat/ask/", { question: msg, history: historico.slice(-3) });
      const answerText = res.data.response || JSON.stringify(res.data);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answerText,
          timestamp: new Date(),
        },
      ]);
    } catch (error: any) {
      console.error("Erro no chat:", error);
      // ⚠️ CORREÇÃO: antes, QUALQUER erro (rede fora do ar, 500, ou falta de
      // consentimento) mostrava a mesma mensagem genérica. O backend recusa
      // com 403 especificamente quando a consultora nunca ativou o
      // consentimento de IA (LGPD, opt-in — desligado por padrão). Sem essa
      // distinção, ela via "ocorreu um erro" sem saber que é só um botão
      // pra ligar em Configurações.
      const semConsentimento = error?.response?.status === 403;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: semConsentimento
            ? "Pra eu poder te ajudar, preciso que você ative o uso de IA. Vá em Configurações → Privacidade e ligue \"Recursos de inteligência artificial\" — aí é só voltar aqui e perguntar de novo. 💜"
            : "⚠️ Ocorreu um erro ao contatar o assistente IA.",
          timestamp: new Date(),
        },
      ]);
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ══════════════════════════════════════════
          BOTÃO FLUTUANTE
          ══════════════════════════════════════════ */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/30 transition-shadow hover:shadow-xl hover:shadow-brand/40 overflow-hidden"
          >
            <img
              src={amorinhaAvatar}
              alt="Amorinha"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (
                  e.target as HTMLImageElement
                ).parentElement!.innerHTML =
                  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
              }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          JANELA DO CHAT
          ══════════════════════════════════════════ */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-4 right-4 left-4 z-50 flex h-[70vh] max-h-[520px] flex-col overflow-hidden rounded-2xl border border-brand/20 bg-card shadow-2xl sm:left-auto sm:bottom-6 sm:right-6 sm:h-[520px] sm:w-[380px]"
          >
            {/* ── Cabeçalho ── */}
            <div className="flex items-center justify-between bg-gradient-to-r from-brand to-brand-hover px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-white/30 shrink-0">
                  <img
                    src={amorinhaAvatar}
                    alt="Amorinha"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Amorinha</p>
                  <p className="text-xs text-white/70">
                    Sua assistente de estoque 💜
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Mensagens ── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="mt-1 h-6 w-6 shrink-0 rounded-full overflow-hidden border border-brand/20">
                      <img
                        src={amorinhaAvatar}
                        alt="Amorinha"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-brand text-white rounded-br-md"
                        : "bg-brand-soft text-foreground border border-brand/10 rounded-bl-md"
                    }`}
                  >
                    {msg.content.split("\n").map((line, i) => (
                      <p key={i} className={i > 0 ? "mt-1" : ""}>
                        {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                          part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={j}>{part.slice(2, -2)}</strong>
                          ) : (
                            <span key={j}>{part}</span>
                          )
                        )}
                      </p>
                    ))}
                  </div>
                  {msg.role === "user" && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                      <User className="h-3.5 w-3.5 text-brand-rose" />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Loading */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <div className="h-6 w-6 rounded-full overflow-hidden border border-brand/20">
                    <img
                      src={amorinhaAvatar}
                      alt="Amorinha"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex gap-1 rounded-2xl bg-brand-soft px-4 py-3">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-brand-rose/50 animation-delay-[0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-brand-rose/50 animation-delay-[150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-brand-rose/50 animation-delay-[300ms]" />
                  </div>
                </motion.div>
              )}

              {/* Sugestões iniciais */}
              {messages.length === 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="rounded-full border border-brand-peach bg-brand-soft px-3 py-1 text-xs text-brand-rose transition-colors hover:border-brand/30 hover:bg-brand-peach/30 hover:text-brand"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Campo de entrada ── */}
            <div className="border-t border-brand-peach/30 bg-card p-3">
              <div className="flex items-center gap-2 rounded-xl border border-brand/15 bg-brand-soft/50 px-3 py-2 focus-within:border-brand/30 focus-within:ring-1 focus-within:ring-brand/20">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Pergunte sobre seu estoque..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-brand-rose/50 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition-opacity disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};