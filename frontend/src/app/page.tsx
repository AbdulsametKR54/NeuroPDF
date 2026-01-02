"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import NeuroLogo from "@/components/NeuroLogo";
import { sendRequest } from "@/utils/api";

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  // Hangi istatistiği gösteriyoruz? (false: Global, true: Kişisel)
  const [showPersonal, setShowPersonal] = useState(false);

  // Global İstatistikler State'i
  const [globalStats, setGlobalStats] = useState({
    total_users: 0,
    total_processed: 0,
    total_ai_summaries: 0
  });

  // ✅ DEĞİŞİKLİK 1: Kişisel İstatistikler State'ine 'role' eklendi
  const [userStats, setUserStats] = useState({
    summary_count: 0,
    tools_count: 0,
    role: "Yükleniyor..." // Varsayılan değer
  });

  // 1. Global İstatistikleri Çek
  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const data = await sendRequest("/files/global-stats", "GET");
        if (data) setGlobalStats(data);
      } catch (error) {
        console.error("Global istatistik hatası:", error);
      }
    };
    fetchGlobalStats();
  }, []);

  // 2. Kullanıcı Giriş Yaptıysa Kişisel Verileri Çek
  useEffect(() => {
    if (session) {
      const fetchUserStats = async () => {
        try {
          const data = await sendRequest("/files/user/stats", "GET");
          if (data) setUserStats(data);
        } catch (error) {
          console.error("Kullanıcı istatistik hatası:", error);
        }
      };
      fetchUserStats();
    }
  }, [session]);

  // 3. Otomatik Döngü (15 Saniyede Bir)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (session) {
      interval = setInterval(() => {
        setShowPersonal((prev) => !prev);
      }, 10000);
    } else {
      setShowPersonal(false);
    }

    return () => clearInterval(interval);
  }, [session]);

  // ✅ DEĞİŞİKLİK 2: Role göre renk belirleyen fonksiyon
  const getRoleColorClass = (role: string) => {
    // Büyük/küçük harf duyarlılığını kaldırmak için
    const normalizedRole = role ? role.toLowerCase() : "";

    if (normalizedRole === "admin") return "text-red-600 dark:text-red-400"; // Admin Kırmızı
    if (normalizedRole === "pro") return "text-amber-500 dark:text-amber-400"; // Pro Altın/Sarı
    return "text-emerald-600 dark:text-emerald-400"; // Standart Yeşil
  };

  // Ekranda gösterilecek verileri belirle
  const isPersonalMode = session && showPersonal;

  const currentStats = isPersonalMode
    ? {
        // --- KİŞİSEL MOD ---
        title: t('myStats') || "İstatistiklerim",
        
        // ✅ DEĞİŞİKLİK 3: Backend'den gelen Rol bilgisini renkli göster
        col1_val: (
            <span className={getRoleColorClass(userStats.role)}>
                {userStats.role}
            </span>
        ),
        col1_label: t("accountType") || "Hesap Türü", // "Hesap Durumu" yerine "Hesap Türü"
        
        col2_val: userStats.tools_count,
        col2_label: t("myFilesProcessed") || "Dosyalarım",
        
        col3_val: userStats.summary_count,
        col3_label: t("myAiOperations") || "AI İşlemlerim"
      }
    : {
        // --- GLOBAL MOD ---
        title: t('globalStats') || "Genel Bakış",
        col1_val: globalStats.total_users,
        col1_label: t("activeUsers") || "Toplam Kullanıcı",
        col2_val: globalStats.total_processed,
        col2_label: t("filesProcessed") || "İşlenen Dosya",
        col3_val: globalStats.total_ai_summaries,
        col3_label: t("aiOperations") || "AI İşlemi"
      };

  return (
    <main className="flex items-center justify-center min-h-screen p-6 pt-24 text-[var(--foreground)] relative overflow-hidden">
      
      {/* Arkaplan Dekoru */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-[var(--button-bg)] opacity-5 blur-[100px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 bg-blue-500 opacity-5 blur-[100px] rounded-full pointer-events-none"></div>

      <div
        className="p-10 w-full max-w-4xl flex flex-col items-center gap-8 text-center rounded-3xl shadow-2xl border transition-all duration-300 backdrop-blur-sm"
        style={{
          backgroundColor: "var(--container-bg)",
          borderColor: "var(--navbar-border)",
        }}
      >
        {/* Başlık ve Logo */}
        <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4 duration-700">
          <NeuroLogo className="w-56 h-auto text-black dark:text-white" />
          <h1 className="sr-only">Neuro PDF</h1>
        </div>

        {/* Açıklama */}
        <p className="max-w-2xl text-lg opacity-80 leading-relaxed animate-in slide-in-from-bottom-5 duration-700 delay-100">
          {t("landingDescription") || "PDF dosyalarınızı birleştirin, düzenleyin ve yapay zeka ile özetleyin. Hepsi tek bir yerde, hızlı ve güvenli."}
        </p>

        {/* Geçiş Başlığı */}
        {session && (
            <div className="text-sm font-semibold tracking-widest uppercase opacity-40 animate-pulse">
                — {currentStats.title} —
            </div>
        )}

        {/* İSTATİSTİK GRID */}
        <div key={isPersonalMode ? "personal" : "global"} className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            
            {/* Kart 1 (Kullanıcı Sayısı / Hesap Türü) */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{currentStats.col1_val}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{currentStats.col1_label}</span>
            </div>

            {/* Kart 2 (İşlenen Dosya / Dosyalarım) */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{currentStats.col2_val}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{currentStats.col2_label}</span>
            </div>

            {/* Kart 3 (AI İşlemi / AI İşlemlerim) */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{currentStats.col3_val}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{currentStats.col3_label}</span>
            </div>

        </div>

        {/* Copyright Alanı */}
        <p className="mt-6 text-[10px] opacity-40 font-mono tracking-wider">
            Copyright &copy; {new Date().getFullYear()} Abdulsamet KIR - Süleyman GÜLTER
        </p>
      </div>
    </main>
  );
}