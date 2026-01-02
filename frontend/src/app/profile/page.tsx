"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api";
import { usePdf } from "@/context/PdfContext";

// Session user tipini genişletelim (id'ye erişim için)
interface ExtendedUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const user = session?.user as ExtendedUser | undefined;
  const router = useRouter();
  const { t } = useLanguage();
  const { savePdf } = usePdf();
  
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({ summary_count: 0, tools_count: 0, role: "Standart" });
  
  // ✅ Avatar Kaynağı State'i (Anlık değişim için)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  // Modal State'leri
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Avatar Modal State'leri
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalMode, setModalMode] = useState<'select' | 'generate'>('select');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Generate State'leri
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [tempAvatarId, setTempAvatarId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // LLM State
  const [llmChoice, setLlmChoice] = useState<'local' | 'cloud'>('local');
  const [loadingLlm, setLoadingLlm] = useState(false);

  useEffect(() => {
    savePdf(null as any); 
  }, [savePdf]);

  useEffect(() => {
    setMounted(true);
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // ✅ 1. ADIM: Sayfa yüklenince verileri ve AVATARI çek
  useEffect(() => {
    const fetchAllData = async () => {
      if (status === "authenticated") {
        try {
          // İstatistikleri ve Rolü çek
          const statsData = await sendRequest("/files/user/stats");
          setStats(statsData);
          
          // Eğer backend'den LLM tercihi de geliyorsa burada setLlmChoice yapabilirsiniz
          // if (statsData.llm_choice === 1) setLlmChoice('cloud');

          // Avatarı çek
          await fetchUserAvatar();
        } catch (e) {
          console.error("Veri çekilemedi:", e);
        }
      }
    };
    fetchAllData();
  }, [status]);

  // ✅ 2. ADIM: Backend'den Güncel Avatarı Çeken Fonksiyon
  const fetchUserAvatar = async () => {
    if (!user) return;
    try {
        // Session'daki resim varsayılan olsun (ilk başta boş kalmasın)
        if (!avatarSrc && user.image) {
            setAvatarSrc(user.image);
        }

        const userId = user.id || "me";
        // Token'ı session'dan alıyoruz (Session yapınıza göre accessToken veya idToken olabilir)
        const token = (session as any)?.accessToken; 

        // Blob olarak resmi çekiyoruz
        const res = await fetch(`http://localhost:8000/api/v1/user/${userId}/avatar`, {
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        });

        if (res.ok) {
            // Backend'den gelen resmi tarayıcıda gösterilebilir URL'e çevir
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            setAvatarSrc(objectUrl);
        } else {
            console.warn("Avatar bulunamadı veya yetki yok.");
        }
    } catch (e) {
        console.error("Avatar getirme hatası:", e);
    }
  };

  // --- FONKSİYONLAR ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      alert(t('onlyPngAllowed') || "Sadece PNG dosyaları yüklenebilir.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const userId = user?.id || "me";
      const token = (session as any)?.accessToken;
      
      const res = await fetch(`http://localhost:8000/api/v1/user/${userId}/avatar`, {
        method: "POST",
        headers: {
           ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) throw new Error("Upload failed");

      alert(t('imageUploadSuccess') || "Profil resmi güncellendi!");
      setShowImageModal(false);
      
      // ✅ 3. ADIM: Yükleme bitince avatarı backend'den tekrar çekip yenile
      await fetchUserAvatar();

    } catch (error) {
      console.error("Yükleme hatası:", error);
      alert(t('imageUploadError') || "Yükleme başarısız.");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setPreviewImage(null);
    setTempAvatarId(null);

    try {
        const userId = user?.id || "me";
        const res = await sendRequest(`/api/v1/user/${userId}/avatar/generate`, "POST", {
            prompt: aiPrompt
        });

        if (res.preview_image && res.temp_avatar_id) {
            setPreviewImage(res.preview_image);
            setTempAvatarId(res.temp_avatar_id);
        }
    } catch (error) {
        console.error("Generate error:", error);
        alert("Resim oluşturulamadı.");
    } finally {
        setGenerating(false);
    }
  };

  const handleConfirmAvatar = async () => {
      if (!tempAvatarId) return;
      setConfirming(true);
      try {
          const userId = user?.id || "me";
          await sendRequest(`/api/v1/user/${userId}/avatar/confirm`, "POST", {
              temp_avatar_id: tempAvatarId
          });

          alert("Yeni avatarınız kaydedildi!");
          setShowImageModal(false);
          setModalMode('select');
          setPreviewImage(null);
          setAiPrompt("");
          
          // ✅ 4. ADIM: Onaylanınca avatarı yenile
          await fetchUserAvatar();

      } catch (error) {
          console.error("Confirm error:", error);
          alert("Hata oluştu.");
      } finally {
          setConfirming(false);
      }
  };

  const handleLlmSelection = (choice: 'local' | 'cloud') => setLlmChoice(choice);

  const handleSaveLlm = async () => {
    setLoadingLlm(true);
    try {
        await sendRequest("/files/user/update-llm", "POST", { provider: llmChoice });
        // Başarı mesajı eklenebilir
    } catch (error) {
        console.error("Hata:", error);
        alert("Hata oluştu.");
    } finally {
        setLoadingLlm(false);
    }
  };

  const handleRequestDelete = () => setShowConfirmModal(true);
  const handleCancelDelete = () => setShowConfirmModal(false);
  const handleConfirmDelete = async () => {
    setShowConfirmModal(false);
    setIsDeleting(true);
    try {
      await sendRequest("/auth/delete-account", "DELETE");
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      alert(t('deleteAccountError') || "Hata oluştu.");
      setIsDeleting(false);
    }
  };

  const resetModal = () => {
      setShowImageModal(false);
      setTimeout(() => {
          setModalMode('select');
          setPreviewImage(null);
          setAiPrompt("");
      }, 300);
  };

  if (!mounted || status === "loading") {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto flex flex-col gap-6 pt-24">
        <div className="h-48 w-full bg-[var(--container-bg)] animate-pulse rounded-3xl border border-[var(--navbar-border)]"></div>
      </div>
    );
  }

  if (!session?.user) return null;

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)] pt-24 relative">
      
      {/* 🔴 HESAP SİLME MODALI */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[var(--container-bg)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6">
                <div className="text-center">
                    <h3 className="text-xl font-bold mb-2">{t('deleteAccountTitle') || "Hesabınızı Silmek İstiyor musunuz?"}</h3>
                    <p className="text-sm opacity-60 mb-6">{t('deleteAccountWarning') || "Bu işlem geri alınamaz."}</p>
                </div>
                <div className="flex gap-3 justify-center">
                    <button onClick={handleCancelDelete} className="btn-secondary flex-1">{t('cancel') || "Vazgeç"}</button>
                    <button onClick={handleConfirmDelete} className="btn-danger flex-1">{t('confirmDelete') || "Sil"}</button>
                </div>
            </div>
        </div>
      )}

      {/* 🔵 AVATAR MODALI */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--container-bg)] text-[var(--foreground)] rounded-3xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
                
                <button onClick={resetModal} className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {modalMode === 'select' && (
                    <div className="animate-in slide-in-from-left-4 duration-300">
                        <div className="text-center mb-8 mt-2">
                            <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white"><path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" /><path fillRule="evenodd" d="M9.344 3.071a4.993 4.993 0 015.312 0l.208.107a.6.6 0 01.394.537l.12 1.637c.042.569.458 1.031 1.01 1.13l1.58.283a.6.6 0 01.492.684l-.326 1.956a2.022 2.022 0 01-.137.49l-.57 1.425a.6.6 0 01-.795.26l-1.63-.815a1.5 1.5 0 00-1.892 2.012l.617 1.628a.6.6 0 01-.17.72l-1.503 1.127a2.003 2.003 0 01-2.398 0l-1.503-1.127a.6.6 0 01-.17-.72l.617-1.628a1.5 1.5 0 00-1.892-2.012l-1.63.815a.6.6 0 01-.795-.26l-.57-1.425a2.022 2.022 0 01-.137-.49l-.326-1.956a.6.6 0 01.492-.684l1.58-.283a1.2 1.2 0 001.01-1.13l.12-1.637a.6.6 0 01.394-.537l.208-.107zM7.5 12.75a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" clipRule="evenodd" /></svg>
                            </div>
                            <h3 className="text-2xl font-bold">{t('changeProfileImage') || "Profil Resmini Değiştir"}</h3>
                            <p className="text-sm opacity-60 mt-1">{t('chooseImageOption') || "Yeni bir görünüm için yöntem seçin."}</p>
                        </div>

                        <div className="space-y-3">
                            {/* Dosya Yükle */}
                            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left">
                                <input type="file" accept="image/png" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                                <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                    {uploading ? <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>}
                                </div>
                                <div className="ml-4">
                                    <p className="font-bold text-lg">{t('uploadPng') || "PNG Yükle"}</p>
                                    <p className="text-xs opacity-60">{t('uploadPngHint') || "Cihazınızdan bir dosya seçin."}</p>
                                </div>
                            </button>

                            {/* AI ile Oluştur */}
                            <button onClick={() => setModalMode('generate')} className="w-full group relative flex items-center p-4 rounded-2xl border border-[var(--navbar-border)] hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-all text-left">
                                <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 group-hover:scale-110 transition-transform">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
                                </div>
                                <div className="ml-4">
                                    <p className="font-bold text-lg">{t('generateWithAI') || "AI ile Oluştur"}</p>
                                    <p className="text-xs opacity-60">{t('generateWithAIHint') || "Yapay zeka ile size özel bir avatar."}</p>
                                </div>
                                <div className="absolute top-4 right-4 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">NEW</div>
                            </button>
                        </div>
                    </div>
                )}

                {modalMode === 'generate' && (
                    <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setModalMode('select')} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
                            </button>
                            <h3 className="text-lg font-bold">AI Avatar Studio</h3>
                        </div>

                        {/* Önizleme Alanı */}
                        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-black/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 mb-4 min-h-[250px] relative overflow-hidden">
                            {generating ? (
                                <div className="text-center">
                                    <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-sm font-medium animate-pulse text-purple-500">Sihir yapılıyor...</p>
                                </div>
                            ) : previewImage ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={previewImage} alt="AI Preview" className="w-full h-full object-contain animate-in zoom-in duration-300" />
                            ) : (
                                <div className="text-center opacity-40 p-6">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
                                    <p className="text-sm">Bir açıklama yazın ve avatarınızı oluşturun.</p>
                                </div>
                            )}
                        </div>

                        {!previewImage ? (
                            <div className="flex gap-2">
                                <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Örn: Mavi gözlü, kask takan fütüristik kedi..." className="flex-1 bg-gray-100 dark:bg-white/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none" onKeyDown={(e) => e.key === 'Enter' && handleGenerateImage()} />
                                <button onClick={handleGenerateImage} disabled={generating || !aiPrompt.trim()} className="bg-purple-600 text-white p-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.67C12.436 10.941 7.935 8.558 2.879 8.558a.75.75 0 01-.75-.75c0-5.055 2.383-9.555 6.084-12.436h-.671A3.375 3.375 0 014.217 1.5V1.084a1.5 1.5 0 011.5-1.5h5.996a1.5 1.5 0 011.5 1.5V1.5a3.375 3.375 0 01-3.375 3.375h-.671c2.881 3.684 7.381 6.067 12.436 6.067a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.671A3.375 3.375 0 0120.462 18v.416a1.5 1.5 0 01-1.5 1.5h-5.996a1.5 1.5 0 01-1.5-1.5V18a3.375 3.375 0 013.375-3.375h.671z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => setPreviewImage(null)} className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-700 font-semibold hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">Tekrar Dene</button>
                                <button onClick={handleConfirmAvatar} disabled={confirming} className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">{confirming ? 'Kaydediliyor...' : 'Bu Resmi Kullan'}</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* --- SAYFA İÇERİĞİ --- */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl tracking-tight">{t('profileTitle') || "Profilim"}</h1>
        <button onClick={() => router.back()} className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 016 6v3" /></svg>
          {t('goBack') || "Geri Dön"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        
        {/* SOL KOLON */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <div className="container-card p-6 border border-[var(--navbar-border)] rounded-3xl flex flex-col items-center text-center shadow-lg relative overflow-hidden" style={{ backgroundColor: 'var(--container-bg)' }}>
            <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-[var(--button-bg)] to-transparent opacity-10"></div>
            <div className="relative z-10 w-32 h-32 mb-4 rounded-full border-4 border-[var(--container-bg)] shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center group">
              <button onClick={() => setShowImageModal(true)} className="absolute top-1 right-1 p-2 bg-[var(--button-bg)] text-white rounded-full shadow-lg hover:brightness-110 transition-all z-20 hover:scale-110" title={t('changeProfileImage') || "Profil Resmini Değiştir"}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
              </button>
              
              {/* ✅ GÜNCEL AVATAR GÖSTERİMİ */}
              {avatarSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarSrc} alt="Profil Resmi" className="w-full h-full object-cover"/>
              ) : (
                <span className="text-4xl font-bold text-[var(--button-bg)]">{getInitials(session.user.name || t('defaultUser') || "Kullanıcı")}</span>
              )}
            </div>
            <h2 className="text-xl font-bold truncate w-full px-2" title={session.user.name || ""}>{session.user.name}</h2>
            <p className="text-sm opacity-60 font-medium truncate w-full mb-6 px-2" title={session.user.email || ""}>{session.user.email}</p>
            <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full py-2 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors dark:bg-red-900/10 dark:border-red-900 dark:text-red-400">{t('signOut') || "Çıkış Yap"}</button>
          </div>

          <div className="container-card p-6 border border-[var(--navbar-border)] rounded-3xl shadow-lg flex flex-col relative overflow-hidden transition-all" style={{ backgroundColor: 'var(--container-bg)' }}>
            <div className={`absolute -top-10 -right-10 w-40 h-40 blur-[60px] opacity-5 pointer-events-none rounded-full transition-colors duration-500 ${llmChoice === 'local' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2 relative z-10">
                <div className="p-2 rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M16.5 7.5h-9v9h9v-9z" /><path fillRule="evenodd" d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15a3 3 0 01-3 3h-.75v.75a.75.75 0 01-1.5 0v-.75h-2.25v.75a.75.75 0 01-1.5 0v-.75H9v.75a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75V6.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A1.5 1.5 0 017.5 5.25h9A1.5 1.5 0 0118 6.75v9A1.5 1.5 0 0116.5 17.25h-9A1.5 1.5 0 016 15.75v-9z" clipRule="evenodd" /></svg></div>
                {t('aiPreference') || "AI Model Tercihi"}
            </h3>
            <div className="relative flex p-1 bg-gray-100 dark:bg-black/20 border border-gray-200 dark:border-white/5 rounded-xl mb-6">
                <button onClick={() => handleLlmSelection('local')} className={`relative z-10 flex-1 py-2.5 px-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${llmChoice === 'local' ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm14.25 6a.75.75 0 01-.75.75h-2.25a.75.75 0 01-.75-.75v-2.25a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75v2.25zM9 7.5A.75.75 0 008.25 8.25v2.25a.75.75 0 00.75.75h2.25a.75.75 0 00.75-.75v-2.25a.75.75 0 00-.75-.75H9z" clipRule="evenodd" /></svg>
                    <span className="whitespace-nowrap">Local LLM</span>
                </button>
                <button onClick={() => handleLlmSelection('cloud')} className={`relative z-10 flex-1 py-2.5 px-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${llmChoice === 'cloud' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.25-10.5z" /></svg>
                    <span className="whitespace-nowrap">Cloud LLM</span>
                </button>
            </div>
            <div className="relative z-10 mb-6">
                <div className="flex items-center justify-between mb-3 px-1">
                    <h4 className="text-[11px] font-black uppercase tracking-widest opacity-50">{llmChoice === 'local' ? (t('localFeatures') || "YEREL ÖZELLİKLER") : (t('cloudFeatures') || "BULUT ÖZELLİKLERİ")}</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${llmChoice === 'local' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'}`}>{llmChoice === 'local' ? 'Offline' : 'Online'}</span>
                </div>
                <div className={`p-4 rounded-2xl border transition-all duration-300 ${llmChoice === 'local' ? 'bg-green-50/30 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-blue-50/30 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30'}`}>
                    <ul className="space-y-3">
                        {llmChoice === 'local' ? (
                            <>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"/><span className="opacity-80 leading-snug">{t('localFeat1') || "Maksimum Gizlilik (Veriler cihazda kalır)."}</span></li>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"/><span className="opacity-80 leading-snug">{t('localFeat2') || "İnternet bağlantısı gerektirmez."}</span></li>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"/><span className="opacity-80 leading-snug">{t('localFeat3') || "Hız donanımınıza bağlıdır."}</span></li>
                            </>
                        ) : (
                            <>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/><span className="opacity-80 leading-snug">{t('cloudFeat1') || "En Yüksek Doğruluk (Gemini 1.5)."}</span></li>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/><span className="opacity-80 leading-snug">{t('cloudFeat2') || "Geniş bağlam ve karmaşık analiz."}</span></li>
                                <li className="flex items-start gap-3 text-sm"><div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"/><span className="opacity-80 leading-snug">{t('cloudFeat3') || "Veriler işlenmek üzere gönderilir."}</span></li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
            <div className="mt-auto pt-2 flex justify-center">
                <button onClick={handleSaveLlm} disabled={loadingLlm} className="w-full py-3 px-4 rounded-xl bg-[var(--button-bg)] text-[var(--button-text)] font-semibold shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {loadingLlm ? <>{t('saving') || "Kaydediliyor..."}</> : <><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" /></svg>{t('savePreference') || "Tercihi Kaydet"}</>}
                </button>
            </div>
          </div>
        </div>

        {/* SAĞ KOLON */}
        <div className="md:col-span-2 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg></div>
               <div><p className="text-sm opacity-60 font-medium">{t('membershipType') || "Üyelik Tipi"}</p><p className="text-lg font-bold">{stats.role || t('standardAccount') || "Standart Hesap"}</p></div>
            </div>
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg></div>
               <div><p className="text-sm opacity-60 font-medium">{t('aiSummary') || "AI Özetleme"}</p><p className="text-lg font-bold">{stats.summary_count} {t('processCount') || "İşlem"}</p></div>
            </div>
            <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
               <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M16.338 3.011a4 4 0 01-5.645 5.645L2.25 17.25M6.75 2.25h.75v.75h-.75zM12.75 6.75h.75v.75h-.75z" /></svg></div>
               <div><p className="text-sm opacity-60 font-medium">{t('pdfTools') || "PDF Araçları"}</p><p className="text-lg font-bold">{stats.tools_count} {t('processCount') || "İşlem"}</p></div>
            </div>
          </div>

          <div className="container-card p-8 border border-[var(--navbar-border)] rounded-3xl shadow-lg" style={{ backgroundColor: 'var(--container-bg)' }}>
             <h3 className="text-xl font-semibold mb-4">{t('accountSettings') || "Hesap Ayarları"}</h3>
             <p className="opacity-60 font-normal mb-6">{t('accountSettingsHint') || "Şifre değişikliği ve hesap silme işlemleri için sağlayıcınızın (Google) ayarlarını kullanmanız gerekmektedir."}</p>
             <div className="flex flex-col gap-3">
               <button disabled className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4"><span className="font-semibold">{t('changeEmail') || "E-posta Değiştir"}</span><span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">{t('comingSoon') || "Yakında"}</span></button>
               <button disabled className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4"><span className="font-semibold">{t('downloadData') || "Verilerimi İndir"}</span><span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">{t('comingSoon') || "Yakında"}</span></button>
               <button onClick={handleRequestDelete} className="btn-primary w-full flex justify-between items-center p-4 mt-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 hover:scale-[1.01] transition-all dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40" style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-border)' }}>
                 <span className="font-semibold flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>{t('deleteAccount') || "Hesabımı Sil"}</span>
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-60"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
               </button>
             </div>
          </div>
        </div>
      </div>
    </main>
  );
}