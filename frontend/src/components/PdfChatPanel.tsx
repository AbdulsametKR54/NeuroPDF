"use client";

import { useState, useEffect, useRef } from "react";
import { sendRequest } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import Image from "next/image";

import NeuroLogoIcon from "@/assets/icons/NeuroPDF-Chat.svg";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  file: File;
  isOpen: boolean;
  onClose: () => void;
};

export default function PdfChatPanel({ file, isOpen, onClose }: Props) {
  const { data: session } = useSession();
  const { t } = useLanguage(); // ✅ Dil desteği aktif
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && file && !sessionId && !initializing) {
      initChatSession();
    }
  }, [isOpen, file]);

  const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const initChatSession = async () => {
    setInitializing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const chatRes = await sendRequest("/files/chat/start", "POST", formData, true);
      if (!chatRes.session_id) throw new Error("Oturum açılamadı.");
      setSessionId(chatRes.session_id);
      setMessages([{ 
        role: "assistant", 
        content: t('chatWelcome') || `👋 Merhaba! **"${file.name}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.` 
      }]);
    } catch (e) {
      setMessages([{ role: "assistant", content: t('chatInitError') || "🚫 Sohbet başlatılamadı." }]);
    } finally {
      setInitializing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await sendRequest("/files/chat/message", "POST", {
        session_id: sessionId,
        message: userMsg,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: t('chatConnError') || "⚠️ Bağlantı hatası." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop (Mobil için) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 sm:hidden"
          />

          <motion.div
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            // ✅ Z-Index 40 yapıldı (Navbar'ın altında kalsın diye)
            // ✅ rounded-l-[2rem] eklendi (Sivri oval köşeler)
            className="fixed top-[64px] right-2 bottom-2 w-full sm:w-[480px] z-40 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.1)] overflow-hidden rounded-l-[2rem] rounded-r-lg"
            style={{ 
                backgroundColor: "var(--background)", 
                border: "1px solid var(--container-border)" 
            }}
          >
            <div className="chat-border-glow" />

            {/* --- HEADER --- */}
            <div 
                className="flex items-center justify-between px-8 py-5 border-b relative z-10"
                style={{ backgroundColor: "var(--navbar-bg)", borderColor: "var(--navbar-border)" }}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden">
                    <Image src={NeuroLogoIcon} alt="AI Logo" width={28} height={28} />
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full" style={{ borderColor: "var(--navbar-bg)" }}></span>
                </div>
                <div>
                  <h3 className="font-bold leading-tight" style={{ color: "var(--foreground)" }}>Neuro Chat</h3>
                  <p className="text-xs opacity-60 truncate max-w-[180px]">{file.name}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* --- MESAJ ALANI --- */}
            <div className="chat-messages-area relative flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
                <Image src={NeuroLogoIcon} alt="Watermark" width={250} height={250} />
              </div>

              <div className="space-y-6 relative z-10">
                {initializing && (
                  <div className="flex flex-col items-center justify-center h-full py-20 opacity-50">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-8 h-8 border-2 border-[var(--button-bg)] border-t-transparent rounded-full" />
                    <p className="text-sm mt-4">{t('analyzing') || "Belge analiz ediliyor..."}</p>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((msg, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`flex max-w-[90%] gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-[10px] font-bold">
                          {msg.role === "user" ? (
                            session?.user?.image ? <img src={session.user.image} className="w-full h-full object-cover" alt="U" /> : <span className="text-gray-600">{getInitials(session?.user?.name || "U")}</span>
                          ) : (
                            <Image src={NeuroLogoIcon} alt="AI" width={18} height={18} />
                          )}
                        </div>
                        <div className={`chat-bubble ${msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {loading && <div className="text-xs opacity-50 animate-pulse">{t('aiTyping') || "Neuro yanıt yazıyor..."}</div>}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* --- INPUT ALANI (Alt kısım düzenlendi) --- */}
            <div className="p-4 relative z-10" style={{ backgroundColor: "var(--navbar-bg)", borderTop: "1px solid var(--navbar-border)" }}>
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('chatPlaceholder') || "Sorunuzu yazın..."}
                  disabled={loading || initializing}
                  className="chat-input-field flex-1"
                />
                <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={!input.trim() || loading || initializing} className="btn-primary p-3 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                </motion.button>
              </form>
              
              {/* ✅ Madde 1: Yazı artık butonun tam altında */}
              <p className="text-[10px] text-center mt-3 opacity-40 leading-tight">
                {t('chatDisclaimer') || "NeuroPDF yapay zekası bazen hata yapabilir. Lütfen bilgileri kontrol edin."}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}