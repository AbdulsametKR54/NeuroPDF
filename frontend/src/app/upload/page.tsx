"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { usePdf } from "@/context/PdfContext";
import { useLanguage } from "@/context/LanguageContext";
import { getMaxUploadBytes } from "@/app/config/fileLimits";

// PdfViewer client-side çalıştığı için dynamic import
const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function UploadPage() {
  const { data: session, status } = useSession();
  const { pdfFile, savePdf } = usePdf(); 
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Limit Hesaplama
  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  // --- Dosya İşlemleri ---

  // 1. Bilgisayardan Sürükle-Bırak
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      const f = acceptedFiles[0];
      
      // Limit kontrolü
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        return;
      }

      setFile(f);
      setError(null);
    }
  }, [maxBytes, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
    maxSize: maxBytes, // ✅ Limit bildirildi
    onDropRejected: (fileRejections) => {
        const rejection = fileRejections[0];
        if (rejection.errors[0].code === "file-too-large") {
            setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        } else {
            setError(rejection.errors[0].message);
        }
        setFile(null);
    },
  });

  // 2. Sağ Panelden Sürükle-Bırak (Varsa)
  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
        if (pdfFile.size > maxBytes) {
            setFile(null);
            setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
            return;
        }
        setFile(pdfFile);
        setError(null);
        if (e && 'stopPropagation' in e) {
            e.stopPropagation(); 
            e.preventDefault();
        }
    } else {
        setError(t('panelPdfError') || "Panelde PDF bulunamadı.");
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        e.target.value = '';
        return;
      }
      setFile(f);
      setError(null);
    }
    e.target.value = '';
  };

  // --- SADECE PANELE EKLE (Backend Yok) ---
  const handleAddToPanel = () => {
    if (!file) {
        setError(t('selectFile'));
        return;
    }

    setUploading(true); // Yalandan bir loading gösterelim (Hemen bitse bile)
    
    try {
        // Dosyayı Context'e (Sağ Panele) gönder
        savePdf(file);
        
        // Kullanıcıya bilgi ver (Toast veya Alert)
        // alert(t('pdfAddedToPanel') || "Dosya sağ panele eklendi! Şimdi araçları kullanabilirsiniz."); 
        // Not: Alert yerine toast daha iyi olur ama şimdilik böyle kalsın.

    } catch (err: any) {
        console.error("Panel Error:", err);
        setError("Dosya panele eklenirken bir hata oluştu.");
    } finally {
        setUploading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('uploadPageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone Alanı */}
      <div
        {...getRootProps()}
        onDrop={handleDropFromPanel}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${isDragActive
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80"
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
          }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
            {/* SVG İkonu */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          {isDragActive ? <p>{t('dropActive')}</p> : <p>{t('dropPassive')}</p>}
        </div>
        
        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b> <br/> {t('changeFileHint')}
          </p>
        )}
      </div>

      {/* Dosya Seç Butonu */}
      <div className="mt-6 flex justify-start">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          {t('selectFile')}
          <input type="file" className="hidden" accept=".pdf" onChange={handleSelect} />
        </label>
      </div>

      {/* Önizleme ve Ekleme Butonu */}
      {file && (
        <div className="mt-6 space-y-6">
            <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
                <div className="p-4 border-b border-[var(--navbar-border)]" style={{ backgroundColor: 'var(--container-bg)' }}>
                    <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
                </div>
                <PdfViewer file={file} height={550} />
            </div>

            <div className="flex items-center gap-4 flex-wrap">
                <button
                    onClick={handleAddToPanel}
                    disabled={uploading}
                    className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {uploading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('uploading') || "Ekleniyor..."}
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                            {t('uploadButton') || "Panele Ekle & Devam Et"}
                        </>
                    )}
                </button>

                {!session && (
                    <p className="text-sm opacity-80">
                        💡 <a href="/login" className="underline font-bold" style={{ color: 'var(--button-bg)' }}>{t('loginWarning')}</a>
                    </p>
                )}
            </div>
        </div>
      )}

      {error && (
        <div className="error-box mb-6 shadow-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>

          <span>{error}</span>
        </div>
      )}

      
      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />
    </main>
  );
}