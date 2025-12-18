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
  
  // İstatistik State'i
  const [stats, setStats] = useState({
    total_users: 0,
    total_processed: 0,
    total_ai_summaries: 0
  });

  // İstatistikleri Backend'den Çek
  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        // ✅ DÜZELTME: Backend files.py içinde olduğu için adres /files/ ile başlamalı
        const data = await sendRequest("/files/global-stats", "GET");
        if (data) setStats(data);
      } catch (error) {
        console.error("İstatistikler alınamadı:", error);
      }
    };

    fetchGlobalStats();
  }, []);

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

        {/* --- Start Now Butonu Kaldırıldı --- */}

        {/* İSTATİSTİK GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-4 animate-in slide-in-from-bottom-8 duration-700 delay-300">
            
            {/* Kart 1: Toplam Kullanıcı */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{stats.total_users}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{t('activeUsers') || "Kullanıcı"}</span>
            </div>

            {/* Kart 2: İşlenen Dosya */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{stats.total_processed}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{t('filesProcessed') || "İşlenen Dosya"}</span>
            </div>

            {/* Kart 3: AI İşlemi */}
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] bg-white/50 dark:bg-white/5 backdrop-blur flex flex-col items-center gap-2 transition-transform hover:scale-105">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 mb-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                </div>
                <span className="text-3xl font-extrabold">{stats.total_ai_summaries}</span>
                <span className="text-sm opacity-60 font-medium uppercase tracking-wide">{t('aiOperations') || "AI İşlemi"}</span>
            </div>

        </div>

        {/* Durum Bilgisi (Küçük) */}
        {session && (
            <p className="mt-2 text-xs opacity-50 font-mono">
                {t("loggedInAs")} {session.user?.email}
            </p>
        )}
      </div>
    </main>
  );
}