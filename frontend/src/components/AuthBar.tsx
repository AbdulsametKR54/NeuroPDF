"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

export default function AuthBar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();

  // Yükleniyor durumu (Skeleton)
  if (status === "loading") {
    return <div className="w-24 h-10 animate-pulse bg-[var(--container-bg)] rounded-xl opacity-50 border border-[var(--container-border)]"></div>;
  }

  // Oturum Varsa
  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        {/* Kullanıcı Adı (Mobilde gizlenebilir) */}
        <span 
          className="hidden md:inline-block text-sm font-medium opacity-80 truncate max-w-[150px]" 
        >
          {session.user.name || session.user.email}
        </span>
        
        {/* Çıkış Yap Butonu */}
        <button
          onClick={() => signOut()}
          // whitespace-nowrap: Tek satırda kalmasını garanti eder
          className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border transition-all shadow-sm whitespace-nowrap
                     text-red-600 border-red-200 bg-red-50 hover:bg-red-100 
                     dark:text-red-400 dark:border-red-900 dark:bg-red-900/10 dark:hover:bg-red-900/30"
        >
          {t('signOut')}
        </button>
      </div>
    );
  }

  // Oturum Yoksa (Giriş Yap)
  return (
    <button
      onClick={() => router.push("/login")}
      // ✅ BURASI DEĞİŞTİ: Senin global.css'indeki sınıfı kullanıyoruz
      className="btn-primary whitespace-nowrap" 
    >
      {t('loginLink')}
    </button>
  );
}