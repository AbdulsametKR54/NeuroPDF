"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleGuest = async () => {
    setLoading(true);
    try {
      // API URL'ini env dosyasından veya varsayılan localhost'tan alıyoruz
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/guest/session`, {
        method: "POST",
      });
      
      if (!res.ok) throw new Error("Guest session creation failed");
      
      const data = await res.json();
      localStorage.setItem("guest_id", data.id);
      router.push("/upload");
    } catch (err) {
      console.error(err);
      alert(t('guestLoginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Ana kapsayıcı: Layout'tan gelen arka plan rengini kullanır, içeriği ortalar
    <main className="flex items-center justify-center min-h-screen p-6 pt-24 text-[var(--foreground)]">
      
      {/* Kart Bileşeni */}
      <div 
        className="p-10 w-full max-w-lg flex flex-col items-center gap-6 text-center rounded-2xl shadow-xl border transition-colors duration-300"
        style={{ 
            backgroundColor: 'var(--container-bg)', 
            borderColor: 'var(--navbar-border)' 
        }}
      >
        
        {/* Başlık */}
        <h1 className="text-4xl font-bold mb-4 tracking-tight flex items-center gap-4">
          {/* LOGO İKONU */}
          <img 
            src="/icons/Neuro-PDF.ico" 
            alt="NeuroPDF Logo" 
          />
          
          {/* BAŞLIK METNİ */}
          {t('appTitle')}
        </h1>
        
        {/* Açıklama */}
        <p className="mb-8 leading-relaxed text-lg opacity-80">
          {t('landingDescription')}
        </p>

        {/* Buton Grubu */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full">
          {!session ? (
            <button
              onClick={() => signIn("google")}
              className="flex-1 px-5 py-3 rounded-xl transition-transform hover:scale-105 font-semibold shadow-md"
              style={{ backgroundColor: 'var(--button-bg)', color: 'var(--button-text)' }}
            >
              {t('googleLogin')}
            </button>
          ) : (
            <button
              onClick={() => signOut()}
              className="flex-1 px-5 py-3 rounded-xl transition-transform hover:scale-105 font-semibold shadow-md"
              style={{ backgroundColor: 'var(--button-bg)', color: 'var(--button-text)' }}
            >
              {t('signOut')} ({session.user?.name?.split(" ")[0]})
            </button>
          )}

          <button
            onClick={handleGuest}
            disabled={loading}
            className="flex-1 px-5 py-3 rounded-xl transition-transform hover:scale-105 font-semibold border shadow-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ 
                borderColor: 'var(--button-bg)',
                color: 'var(--button-text)'
            }}
          >
            {loading ? t('guestLoggingIn') : t('guestLogin')}
          </button>
        </div>

        {/* Durum Bilgisi */}
        <p className="mt-6 text-sm opacity-60">
          {status === "loading"
            ? t('sessionChecking')
            : session
            ? `${t('loggedInAs')} ${session.user?.email}`
            : t('notLoggedIn')}
        </p>
      </div>
    </main>
  );
}