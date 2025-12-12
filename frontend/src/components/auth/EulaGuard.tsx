"use client";

import { useEffect, useState, useRef } from "react";
import { useSession, signOut } from "next-auth/react"; // signOut eklendi
import { useLanguage } from "@/context/LanguageContext";

export default function EulaGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const { language } = useLanguage();

  const [showModal, setShowModal] = useState(false);
  const [eulaContent, setEulaContent] = useState("Loading...");
  const [timeLeft, setTimeLeft] = useState(20);
  const [hasScrolled, setHasScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Session Kontrolü
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // @ts-ignore
      const isAccepted = session.user.eula_accepted;
      
      // Eğer false ise modalı aç
      if (isAccepted === false) {
        setShowModal(true);
        fetchEulaText();
      }
    }
  }, [status, session]);

  // 2. Metni Çek
  const fetchEulaText = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/auth/eula?lang=${language}`);
      const text = await res.text();
      setEulaContent(text);
    } catch (e) {
      setEulaContent("Error loading agreement.");
    }
  };

  // 3. Sayaç
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showModal) {
      setTimeLeft(20);
      setHasScrolled(false);
      timer = setInterval(() => setTimeLeft((p) => (p > 0 ? p - 1 : 0)), 1000);
    }
    return () => clearInterval(timer);
  }, [showModal]);

  // 4. Scroll
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 10) setHasScrolled(true);
    }
  };

  // 5. Onaylama
  const handleAccept = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      // Token'ı al
      // @ts-ignore
      const token = session?.accessToken || session?.user?.accessToken; 

      console.log("Token:", token); // Kontrol için

      // TOKEN YOKSA OTOMATİK ÇIKIŞ YAP (Hata Çözümü)
      if (!token) {
        alert("Oturum süreniz dolmuş veya token hatalı. Lütfen tekrar giriş yapın.");
        await signOut({ callbackUrl: "/login" });
        return;
      }

      const res = await fetch(`${apiUrl}/auth/accept-eula`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ accepted: true }),
      });

      if (res.ok) {
        setShowModal(false);
        await update({ eula_accepted: true });
        window.location.reload();
      } else {
        // Backend "Invalid token" derse çıkış yap
        if (res.status === 401) {
           alert("Oturum geçersiz. Çıkış yapılıyor...");
           await signOut({ callbackUrl: "/login" });
        } else {
           alert(language === 'tr' ? "Bir hata oluştu." : "An error occurred.");
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const canAccept = timeLeft === 0 && hasScrolled;

  return (
    <>
      {children}

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
           <div className="w-full max-w-2xl bg-[var(--container-bg)] rounded-2xl shadow-2xl flex flex-col h-[80vh] border border-[var(--navbar-border)] text-[var(--foreground)]">
              
              {/* Header */}
              <div className="p-6 border-b border-[var(--navbar-border)]">
                <h2 className="text-2xl font-bold text-red-500">
                  {language === 'tr' ? "Son Bir Adım: Kullanıcı Sözleşmesi" : "One Last Step: EULA"}
                </h2>
                <p className="opacity-70 text-sm mt-1">
                  {language === 'tr' 
                    ? "Devam etmek için sözleşmeyi okuyup onaylamanız gerekmektedir." 
                    : "You must read and accept the agreement to continue."}
                </p>
              </div>

              {/* Content */}
              <div 
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 text-sm whitespace-pre-wrap font-mono opacity-90"
                style={{ backgroundColor: 'var(--background)' }}
              >
                {eulaContent}
                <div className="h-20"></div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-[var(--navbar-border)] flex flex-col md:flex-row items-center justify-between gap-4 bg-[var(--container-bg)]">
                 
                 {/* SOL: Bilgi ve ÇIKIŞ Butonu */}
                 <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold opacity-80">
                        <span className={timeLeft > 0 ? "text-red-400" : "text-green-500"}>
                            {timeLeft > 0 
                            ? `⏳ ${language === 'tr' ? 'Okuma Süresi' : 'Reading Time'}: ${timeLeft}s` 
                            : `✅ ${language === 'tr' ? 'Süre Doldu' : 'Time Completed'}`}
                        </span>
                        <span className="mx-2">|</span>
                        <span className={!hasScrolled ? "text-red-400" : "text-green-500"}>
                            {!hasScrolled 
                            ? `📜 ${language === 'tr' ? 'Aşağı kaydırınız' : 'Scroll down'}` 
                            : `✅ ${language === 'tr' ? 'Okundu' : 'Scrolled'}`}
                        </span>
                    </div>
                    
                    {/* Çıkış Butonu: Kullanıcı vazgeçerse */}
                    <button 
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="text-xs text-red-500 hover:text-red-600 underline text-left font-semibold"
                    >
                        {language === 'tr' ? "Kabul etmiyorum, çıkış yap." : "I decline, sign out."}
                    </button>
                 </div>

                 {/* SAĞ: Onay Butonu */}
                 <button
                    onClick={handleAccept}
                    disabled={!canAccept}
                    className="px-8 py-3 rounded-xl font-bold transition-all"
                    style={{ 
                      backgroundColor: canAccept ? 'var(--button-bg)' : 'gray',
                      color: canAccept ? 'var(--button-text)' : 'white',
                      opacity: canAccept ? 1 : 0.5,
                      cursor: canAccept ? 'pointer' : 'not-allowed'
                    }}
                 >
                    {language === 'tr' ? "Okudum, Kabul Ediyorum" : "I Read & Accept"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </>
  );
}