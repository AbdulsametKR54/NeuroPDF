"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { pdfService } from "@/services/pdfService";
import { guestService } from "@/services/guestService";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { usePdf } from "@/context/PdfContext";
import { useLanguage } from "@/context/LanguageContext";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function UploadPage() {
  const { data: session } = useSession();
  const { pdfFile, savePdf } = usePdf(); 
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  // --- Dosya İşlemleri ---

  // 1. Bilgisayardan Sürükle-Bırak
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  // 2. Sağ Panelden Sürükle-Bırak (Dropzone bu fonksiyonu kullanır)
  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement>) => {
    if (pdfFile) {
        setFile(pdfFile);
        setError(null);
        if (e && 'stopPropagation' in e) {
            e.stopPropagation(); 
            e.preventDefault();
        }
    } else {
        setError(t('panelPdfError'));
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
    }
    e.target.value = '';
  };

  // --- YENİ UPLOAD (SADECE PANELE GÖNDER) ---
  const handleAddToPanel = () => {
    if (!file) {
        setError(t('selectFile'));
        return;
    }

    // Dosyayı Context'e gönder (Sağ Panelde Açılır)
    savePdf(file);
    
    // Kullanıcıya bilgi ver
    alert(t('pdfAddedToPanel')); 
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('uploadPageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        // Panelden sürüklemeyi yakalamak için onDrop buraya bağlı
        onDrop={handleDropFromPanel}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${isDragActive
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80"
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
          }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
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
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105">
          {t('selectFile')}
          <input type="file" className="hidden" accept=".pdf" onChange={handleSelect} />
        </label>
        
        {/* "Panelden Ekle" butonu buradan kaldırıldı */}
      </div>

      {/* Önizleme ve Yükleme İşlemi */}
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
                    className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {uploading ? t('uploading') : t('uploadButton')}
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
        <div className="mt-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800">
          ⚠️ {error}
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