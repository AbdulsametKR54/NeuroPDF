"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api"; // ✅ Merkezi API
import { usePdf } from "@/context/PdfContext"; // ✅ YENİ: Paneli kapatmak için

export default function RegisterPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { savePdf } = usePdf(); // Context'i aldık

  // Form State
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  
  // UI States
  const [loading, setLoading] = useState(false);
  
  // EULA Logic States
  const [showEulaModal, setShowEulaModal] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [eulaContent, setEulaContent] = useState("Loading agreement...");
  const [timeLeft, setTimeLeft] = useState(20);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // 🔹 1. Sayfa yüklendiğinde Sağ Paneli KAPAT
  useEffect(() => {
    // Context'teki dosyayı temizle -> Layout paneli kapatır
    savePdf(null as any); 
  }, [savePdf]);

  // ---------------------------------------------------------
  // EULA Fetching & Timer Logic
  // ---------------------------------------------------------
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (showEulaModal) {
      // 2. Metni Backend'den Çek (sendRequest ile)
      const fetchEula = async () => {
        try {
          // sendRequest Blob veya JSON dönebilir
          const response = await sendRequest(`/auth/eula?lang=${language}`, "GET");
          
          let text = "";
          if (response instanceof Blob) {
             text = await response.text();
          } else {
             text = typeof response === 'string' ? response : JSON.stringify(response);
          }
          
          setEulaContent(text);
        } catch (error) {
          console.error("EULA Error:", error);
          setEulaContent("Failed to load license agreement.");
        }
      };
      fetchEula();

      // 3. Sayacı Başlat
      setTimeLeft(20); 
      setHasScrolledToBottom(false);
      
      timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [showEulaModal, language]);

  // ---------------------------------------------------------
  // Scroll Handler
  // ---------------------------------------------------------
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 10) {
        setHasScrolledToBottom(true);
      }
    }
  };

  const handleAcceptEula = () => {
    setEulaAccepted(true);
    setShowEulaModal(false);
  };

  // ---------------------------------------------------------
  // Form Handlers
  // ---------------------------------------------------------
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eulaAccepted) {
      alert("Please accept the agreement first.");
      return;
    }

    setLoading(true);

    try {
      // ✅ sendRequest ile Kayıt
      await sendRequest("/auth/register", "POST", { ...form, eula_accepted: true });

      alert(t('registerSuccess'));
      setTimeout(() => router.push("/login"), 2000);

    } catch (err: any) {
      console.error("Register Error:", err);
      alert(err.message || t('registerError'));
    } finally {
      setLoading(false);
    }
  };

  const canAccept = timeLeft === 0 && hasScrolledToBottom;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <div className="w-full max-w-md">
        
        {/* Card Container */}
        <div 
          className="rounded-2xl shadow-xl p-8 border border-[var(--container-border)]"
          style={{ backgroundColor: 'var(--container-bg)' }}
        >
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-2">{t('registerTitle')}</h2>
            <p className="opacity-70 font-medium">{t('registerSubtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block text-sm font-medium mb-1 opacity-80">{t('username')}</label>
              <input
                type="text"
                name="username"
                placeholder={t('username')}
                value={form.username}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all bg-[var(--background)] text-[var(--foreground)] placeholder-gray-400"
                style={{ borderColor: 'var(--navbar-border)', '--tw-ring-color': 'var(--button-bg)' } as React.CSSProperties}
              />
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium mb-1 opacity-80">{t('email')}</label>
              <input
                type="email"
                name="email"
                placeholder={t('email')}
                value={form.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all bg-[var(--background)] text-[var(--foreground)] placeholder-gray-400"
                style={{ borderColor: 'var(--navbar-border)', '--tw-ring-color': 'var(--button-bg)' } as React.CSSProperties}
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-sm font-medium mb-1 opacity-80">{t('password')}</label>
              <input
                type="password"
                name="password"
                placeholder={t('password')}
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all bg-[var(--background)] text-[var(--foreground)] placeholder-gray-400"
                style={{ borderColor: 'var(--navbar-border)', '--tw-ring-color': 'var(--button-bg)' } as React.CSSProperties}
              />
            </div>

            {/* --- EULA Trigger Section --- */}
            <div className="flex items-center gap-2 mt-4">
              <input 
                type="checkbox" 
                checked={eulaAccepted} 
                readOnly 
                className="w-5 h-5 rounded border-gray-300 text-[var(--button-bg)] focus:ring-[var(--button-bg)]"
              />
              <span className="text-sm opacity-80">
                {language === 'tr' ? "Okudum ve onaylıyorum: " : "I have read and agree to: "}
                <button
                  type="button"
                  onClick={() => setShowEulaModal(true)}
                  className="font-bold underline hover:text-[var(--button-bg)]"
                >
                  {t('eulaTitle') || "EULA"}
                </button>
              </span>
            </div>

            {/* Register Button */}
            <button
              type="submit"
              disabled={loading || !eulaAccepted}
              className="w-full px-4 py-3 font-bold rounded-xl shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed mt-2"
              style={{ backgroundColor: 'var(--button-bg)', color: 'var(--button-text)' }}
            >
              {loading ? t('registerButtonLoading') : t('registerButton')}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm opacity-80">
              {t('hasAccount')}{" "}
              <a href="/login" className="font-semibold hover:underline transition-colors" style={{ color: 'var(--button-bg)' }}>
                {t('loginLink')}
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* EULA MODAL */}
      {showEulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div 
            className="w-full max-w-2xl bg-[var(--container-bg)] rounded-2xl shadow-2xl flex flex-col max-h-[85vh] border border-[var(--navbar-border)]"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--navbar-border)] flex justify-between items-center">
              <h3 className="text-xl font-bold">
                {language === 'tr' ? "Kullanıcı Sözleşmesi" : "Terms of Service"}
              </h3>
              <button onClick={() => setShowEulaModal(false)} className="text-2xl font-bold opacity-60 hover:opacity-100">&times;</button>
            </div>

            {/* Scrollable Content */}
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-6 text-sm leading-relaxed whitespace-pre-wrap font-mono opacity-90"
              style={{ backgroundColor: 'var(--background)' }}
            >
              {eulaContent}
              <div className="h-10"></div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-[var(--navbar-border)] flex flex-col md:flex-row items-center justify-between gap-4">
              
              <div className="text-xs opacity-70 flex flex-col gap-1">
                <span className={timeLeft > 0 ? "text-red-400 font-semibold" : "text-green-500 font-semibold"}>
                  {timeLeft > 0 
                    ? `⏳ ${language === 'tr' ? 'Lütfen okuyun' : 'Please read'}: ${timeLeft}s`
                    : `✅ ${language === 'tr' ? 'Süre doldu.' : 'Time completed.'}`
                  }
                </span>
                <span className={!hasScrolledToBottom ? "text-red-400 font-semibold" : "text-green-500 font-semibold"}>
                   {!hasScrolledToBottom 
                     ? `📜 ${language === 'tr' ? 'En aşağıya inmelisiniz.' : 'Please scroll to the bottom.'}`
                     : `✅ ${language === 'tr' ? 'Okuma tamamlandı.' : 'Reading completed.'}`
                   }
                </span>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <button
                  onClick={() => setShowEulaModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--navbar-border)] hover:bg-white/5 transition-colors"
                >
                  {language === 'tr' ? "Vazgeç" : "Cancel"}
                </button>
                
                <button
                  onClick={handleAcceptEula}
                  disabled={!canAccept}
                  className="px-6 py-2 rounded-lg font-bold transition-all"
                  style={{ 
                    backgroundColor: canAccept ? 'var(--button-bg)' : 'gray',
                    color: canAccept ? 'var(--button-text)' : 'white',
                    cursor: canAccept ? 'pointer' : 'not-allowed',
                    opacity: canAccept ? 1 : 0.5
                  }}
                >
                   {canAccept 
                     ? (language === 'tr' ? "Kabul Ediyorum" : "I Accept")
                     : (language === 'tr' ? `Bekleyiniz (${timeLeft})` : `Please Wait (${timeLeft})`)
                   }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}