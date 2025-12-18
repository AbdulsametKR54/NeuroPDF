"use client";

import { useState, useEffect, useRef } from "react";
import { sendRequest } from "@/utils/api";
import { useLanguage } from "@/context/LanguageContext";
import ReactMarkdown from "react-markdown"; // ✅ Eklendi
import remarkGfm from "remark-gfm"; // ✅ Eklendi (Tablo desteği için)

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
  const { t } = useLanguage();
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
  }, [messages]);

  useEffect(() => {
    if (isOpen && file && !sessionId && !initializing) {
      initChatSession();
    }
  }, [isOpen, file]);

  const initChatSession = async () => {
    setInitializing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const chatRes = await sendRequest("/files/chat/start", "POST", formData, true);
      
      if (!chatRes.session_id) throw new Error("Oturum açılamadı.");

      setSessionId(chatRes.session_id);
      setMessages([{ role: "assistant", content: `Merhaba! **"${file.name}"** belgesi hafızama yüklendi. Sorularınızı bekliyorum.` }]);

    } catch (e) {
      console.error(e);
      setMessages([{ role: "assistant", content: "Sohbet başlatılamadı. Lütfen tekrar deneyin." }]);
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
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Bir hata oluştu." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed top-[64px] right-0 h-[calc(100vh-64px)] w-full sm:w-[450px] bg-[var(--background)] border-l border-[var(--navbar-border)] shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300"
    >
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--navbar-border)] bg-[var(--container-bg)]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.159 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg">AI Sohbet</h3>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* MESAJ ALANI */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--background)]">
        {initializing && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div 
              className={`max-w-[95%] p-3 rounded-2xl text-sm leading-relaxed overflow-hidden ${
                msg.role === "user" 
                  ? "bg-indigo-600 text-white rounded-br-none" 
                  : "bg-[var(--container-bg)] border border-[var(--navbar-border)] rounded-bl-none text-[var(--foreground)]"
              }`}
            >
              {/* ✅ BURASI DEĞİŞTİ: Düz metin yerine Markdown Render Ediliyor */}
              {msg.role === "user" ? (
                msg.content
              ) : (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Tabloları şık göstermek için özel CSS sınıfları
                    table: ({node, ...props}) => <div className="overflow-x-auto my-2 rounded-lg border border-[var(--navbar-border)]"><table className="w-full text-left text-sm" {...props} /></div>,
                    thead: ({node, ...props}) => <thead className="bg-gray-100 dark:bg-gray-800/50 uppercase text-xs font-semibold" {...props} />,
                    tbody: ({node, ...props}) => <tbody className="divide-y divide-[var(--navbar-border)]" {...props} />,
                    tr: ({node, ...props}) => <tr className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors" {...props} />,
                    th: ({node, ...props}) => <th className="px-3 py-2" {...props} />,
                    td: ({node, ...props}) => <td className="px-3 py-2" {...props} />,
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-indigo-600 dark:text-indigo-400" {...props} />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        
        {loading && (
           <div className="flex justify-start">
             <div className="bg-[var(--container-bg)] p-3 rounded-2xl rounded-bl-none border border-[var(--navbar-border)] text-sm opacity-70 flex gap-2 items-center">
               <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
               <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></span>
               <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT ALANI */}
      <div className="p-4 border-t border-[var(--navbar-border)] bg-[var(--container-bg)]">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tablo, özet veya bilgi sorun..."
            className="flex-1 bg-[var(--background)] border border-[var(--navbar-border)] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--foreground)]"
          />
          <button 
            type="submit" 
            disabled={!sessionId || loading || initializing}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}