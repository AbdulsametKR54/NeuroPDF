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
        
        {/* ✅ GÜNCELLENDİ: Kullanıcı Adı Butonu */}
        <button 
          onClick={() => router.push('/profile')} // Burayı '/dashboard' veya '/settings' yapabilirsin
          className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200
                     text-sm font-medium opacity-80 hover:opacity-100 hover:scale-105
                     bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent hover:border-[var(--navbar-border)]"
          title="Profilime Git"
        >
          {/* İkon: Kullanıcı */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>

          <span className="truncate max-w-[120px]">
            {session.user.name || session.user.email}
          </span>
        </button>
        
        {/* Çıkış Yap Butonu */}
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl border transition-all shadow-sm whitespace-nowrap
                     text-red-600 border-red-200 bg-red-50 hover:bg-red-100 hover:scale-105
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
      className="btn-primary whitespace-nowrap" 
    >
      {t('loginLink')}
    </button>
  );
}