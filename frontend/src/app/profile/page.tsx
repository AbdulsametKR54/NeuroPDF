"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api";
import { usePdf } from "@/context/PdfContext";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const { savePdf } = usePdf();
  
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ summary_count: 0, tools_count: 0 });
  
  // ✅ STATE 1: Onay Penceresi Görünürlüğü
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // ✅ STATE 2: Silme İşlemi Yükleniyor Durumu
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    savePdf(null as any); 
  }, [savePdf]);

  useEffect(() => {
    setMounted(true);
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchStats = async () => {
      if (status === "authenticated") {
        try {
          const data = await sendRequest("/files/user/stats");
          setStats(data); 
        } catch (e) {
          console.error("İstatistik çekilemedi:", e);
        }
      }
    };

    fetchStats();
  }, [status]);

  // --- FONKSİYONLAR ---

  const handleRequestDelete = () => {
    setShowConfirmModal(true);
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
  };

  const handleConfirmDelete = async () => {
    setShowConfirmModal(false);
    setIsDeleting(true);

    try {
      await sendRequest("/auth/delete-account", "DELETE");
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      console.error("Hesap silme hatası:", error);
      alert(t('deleteAccountError') || "Hesap silinirken bir hata oluştu.");
      setIsDeleting(false);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto flex flex-col gap-6 pt-24">
        <div className="h-48 w-full bg-[var(--container-bg)] animate-pulse rounded-3xl border border-[var(--navbar-border)]"></div>
        <div className="h-64 w-full bg-[var(--container-bg)] animate-pulse rounded-3xl border border-[var(--navbar-border)]"></div>
      </div>
    );
  }

  if (!session?.user) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)] pt-24 relative">
      
      {/* 🔴 1. ARA SAHNE: ONAY PENCERESİ (MODAL) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--container-bg)] text-[var(--foreground)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6 transform scale-100 transition-transform animate-in zoom-in-95 duration-200">
                
                {/* İkon */}
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-red-600 dark:text-red-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                </div>

                {/* Başlık ve Metin */}
                <div className="text-center">
                    {/* ✅ GÜNCELLENDİ: Açık modda tam siyah (text-black), koyu modda beyaz */}
                    <h3 className="text-xl font-bold text-black dark:text-white mb-2">
                        {t('deleteAccountTitle') || "Hesabınızı Silmek İstiyor musunuz?"}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                        {t('deleteAccountWarning') || "Bu işlem geri alınamaz. Tüm verileriniz, yüklediğiniz dosyalar ve istatistikleriniz kalıcı olarak silinecektir."}
                    </p>
                </div>

                {/* Butonlar */}
                <div className="flex gap-3 justify-center">
                    <button 
                        onClick={handleCancelDelete}
                        className="flex-1 px-4 py-2.5 rounded-xl font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        {t('cancel') || "Vazgeç"}
                    </button>
                    <button 
                        onClick={handleConfirmDelete}
                        className="flex-1 px-4 py-2.5 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all hover:scale-[1.02]"
                    >
                        {t('confirmDelete') || "Evet, Hesabı Sil"}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* 🔴 2. YÜKLENİYOR EKRANI */}
      {isDeleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md transition-all">
            <div className="flex flex-col items-center justify-center p-8">
                <div className="relative w-20 h-20">
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-red-900 rounded-full opacity-30"></div>
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-t-red-500 rounded-full animate-spin"></div>
                </div>
                <h2 className="mt-6 text-2xl font-bold tracking-tight text-white animate-pulse">
                    {t('deletingAccount') || "Hesap Siliniyor..."}
                </h2>
                <p className="mt-2 text-sm font-medium text-white/60">
                    {t('pleaseWait') || "Tüm verileriniz temizleniyor, lütfen bekleyin..."} 
                </p>
            </div>
        </div>
      )}

      {/* --- SAYFA İÇERİĞİ --- */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl tracking-tight">{t('profileTitle') || "Profilim"}</h1>
        <button 
          onClick={() => router.back()} 
          className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 016 6v3" />
          </svg>
          {t('goBack') || "Geri Dön"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* SOL KOLON */}
        <div className="md:col-span-1 space-y-6">
          <div className="container-card p-6 border border-[var(--navbar-border)] rounded-3xl flex flex-col items-center text-center shadow-lg relative overflow-hidden"
               style={{ backgroundColor: 'var(--container-bg)' }}>
            
            <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-[var(--button-bg)] to-transparent opacity-10"></div>

            <div className="relative z-10 w-32 h-32 mb-4 rounded-full border-4 border-[var(--container-bg)] shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
              {session.user.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={session.user.image} alt="Profil Resmi" className="w-full h-full object-cover"/>
              ) : (
                <span className="text-4xl font-bold text-[var(--button-bg)]">
                  {getInitials(session.user.name || t('defaultUser') || "Kullanıcı")}
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold truncate w-full px-2" title={session.user.name || ""}>
              {session.user.name}
            </h2>
            <p className="text-sm opacity-60 font-medium truncate w-full mb-6 px-2" title={session.user.email || ""}>
              {session.user.email}
            </p>

            <button 
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full py-2 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors dark:bg-red-900/10 dark:border-red-900 dark:text-red-400"
            >
              {t('signOut') || "Çıkış Yap"}
            </button>
          </div>
        </div>

        {/* SAĞ KOLON */}
        <div className="md:col-span-2 space-y-6">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="sm:col-span-2 p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
               </div>
               <div><p className="text-sm opacity-60 font-medium">{t('membershipType') || "Üyelik Tipi"}</p><p className="text-lg font-bold">{t('standardAccount') || "Standart Hesap"}</p></div>
            </div>

            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
               </div>
               <div><p className="text-sm opacity-60 font-medium">{t('aiSummary') || "AI Özetleme"}</p><p className="text-lg font-bold">{stats.summary_count} {t('processCount') || "İşlem"}</p></div>
            </div>

            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M16.338 3.011a4 4 0 01-5.645 5.645L2.25 17.25M6.75 2.25h.75v.75h-.75zM12.75 6.75h.75v.75h-.75z" /></svg>
               </div>
               <div><p className="text-sm opacity-60 font-medium">{t('pdfTools') || "PDF Araçları"}</p><p className="text-lg font-bold">{stats.tools_count} {t('processCount') || "İşlem"}</p></div>
            </div>
          </div>

          <div className="container-card p-8 border border-[var(--navbar-border)] rounded-3xl shadow-lg"
               style={{ backgroundColor: 'var(--container-bg)' }}>
             <h3 className="text-xl font-semibold mb-4">{t('accountSettings') || "Hesap Ayarları"}</h3>
             <p className="opacity-60 font-normal mb-6">
               {t('accountSettingsHint') || "Şifre değişikliği ve hesap silme işlemleri için sağlayıcınızın (Google) ayarlarını kullanmanız gerekmektedir."}
             </p>

             <div className="flex flex-col gap-3">
               <button disabled className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4">
                 <span className="font-semibold">{t('changeEmail') || "E-posta Değiştir"}</span>
                 <span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">{t('comingSoon') || "Yakında"}</span>
               </button>
               <button disabled className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4">
                 <span className="font-semibold">{t('downloadData') || "Verilerimi İndir"}</span>
                 <span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">{t('comingSoon') || "Yakında"}</span>
               </button>

               <button 
                 onClick={handleRequestDelete}
                 className="btn-primary w-full flex justify-between items-center p-4 mt-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 hover:scale-[1.01] transition-all dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
                 style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-border)' }}
               >
                 <span className="font-semibold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    {t('deleteAccount') || "Hesabımı Sil"}
                 </span>
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-60">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                 </svg>
               </button>

             </div>
          </div>

        </div>
      </div>
    </main>
  );
}