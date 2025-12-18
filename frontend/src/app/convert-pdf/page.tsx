"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { guestService } from "@/services/guestService";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { usePdf } from "@/context/PdfContext";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api";
import { getMaxUploadBytes } from "@/app/config/fileLimits"; // ✅ Limit ayarı

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function ExtractTextPage() {
  const { data: session, status } = useSession();
  const { pdfFile } = usePdf();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Limit Hesaplama
  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const {
    usageInfo,
    showLimitModal,
    checkLimit,
    closeLimitModal,
    redirectToLogin
  } = useGuestLimit();

  const resetFileState = (newFile: File) => {
    setFile(newFile);
    setProcessedBlob(null);
    setError(null);
  };

  // --- DROPZONE AYARLARI ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      const f = acceptedFiles[0];
      // Manuel Kontrol (Ek güvenlik)
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        return;
      }
      resetFileState(f);
    }
  }, [maxBytes, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
    maxSize: maxBytes, // ✅ Dropzone'a limit bildirildi
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

  // --- YAN PANEL KONTROLÜ ---
  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) { 
        if (pdfFile.size > maxBytes) {
            setFile(null);
            setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
            return;
        }
        resetFileState(pdfFile);
        if (e && 'stopPropagation' in e) {
            e.stopPropagation(); 
            e.preventDefault();
        }
    } else {
        setError(t('panelPdfError'));
    }
  };

  // --- DOSYA SEÇ BUTONU KONTROLÜ ---
  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        e.target.value = '';
        return;
      }
      resetFileState(f);
    }
    e.target.value = ''; 
  };
  
  const handleNewProcess = () => {
    setProcessedBlob(null);
    setFile(null);
    setError(null);
  };

  // --- 1. METNE ÇEVİRME İŞLEMİ ---
  const handleConvertText = async () => {
    if (!file) {
      setError(t('uploadFirst'));
      return;
    }

    const canProceed = await checkLimit();
    if (!canProceed) return;

    setError(null);
    setConverting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // ✅ Convert endpoint'ine istek
      const blob = await sendRequest("/files/convert-text", "POST", formData, true);

      setProcessedBlob(blob);

      if (!session) {
        try {
            await guestService.incrementUsage();
        } catch (limitError) {
            console.error("Sayaç güncellenemedi:", limitError);
        }
      }

    } catch (e: any) {
      console.error("Metin Dönüştürme Hatası:", e);
      setError(e?.message || t('error'));
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = async () => {
     if (!processedBlob) return;
  
     const url = window.URL.createObjectURL(processedBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = file?.name.replace('.pdf', '.txt') || "converted.txt";
     document.body.appendChild(a);
     a.click();
     window.URL.revokeObjectURL(url);
     document.body.removeChild(a);
  };

  // --- 2. KAYDETME İŞLEMİ ---
  const handleSave = async () => {
    if (!processedBlob || !session) return;
    setSaving(true);
    setError(null);
    try {
      const filename = file?.name.replace('.pdf', '_converted.txt') || 'converted.txt';
      
      const fileToSave = new File([processedBlob], filename, { type: 'text/plain' });
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("filename", filename);

      const result = await sendRequest("/files/save-processed", "POST", formData, true);
      
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);

    } catch (e: any) {
      setError(e?.message || t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const isReady = file !== null;
  const hasProcessed = processedBlob !== null;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('pageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        onDrop={handleDropFromPanel} 
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${isDragActive 
            ? "border-[var(--button-bg)] opacity-80 bg-[var(--background)]" 
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
          }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            {isDragActive ? 
            <p>{t('dropActive')}</p> : 
            <p>{t('dropPassive')}</p>
            }
        </div>
        
        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b>
          </p>
        )}
      </div>

      {/* Butonlar */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          {t('selectFile')}
          <input type="file" accept="application/pdf" onChange={handleSelect} className="hidden" />
        </label>
      </div>

      {file && (
        <>
          <div className="mt-4 text-sm opacity-80">
            {t('selectedFile')} <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
          </div>

          {/* Original PDF Viewer */}
          {!hasProcessed && (
            <div className="mt-6 rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
              <div className="p-4 border-b border-[var(--navbar-border)]" style={{ backgroundColor: 'var(--container-bg)' }}>
                <h3 className="text-xl font-semibold opacity-90">{t('activePdfTitle')}</h3>
              </div>
              <PdfViewer file={file} height={550} />
            </div>
          )}
        </>
      )}

      {/* Process Button */}
      {!hasProcessed && (
        <button
          onClick={handleConvertText}
          disabled={!isReady || converting}
          className="btn-primary mt-6 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {converting ? (
            <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('converting')}
            </>
          ) : (
            <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                {t('convertText')}
            </>
          )}
        </button>
      )}

      {/* Processed Result */}
      {hasProcessed && processedBlob && (
        <div className="mt-6 space-y-6">
          
          {/* Text Preview */}
          <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg" style={{ backgroundColor: 'var(--container-bg)' }}>
             <div className="p-4 border-b border-[var(--navbar-border)]">
                <h3 className="text-xl font-semibold opacity-90">{t('textConvertedTitle')}</h3>
             </div>
             
             <div className="p-6">
                <div className="p-4 rounded-lg max-h-96 overflow-y-auto font-mono text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    <p className="text-gray-700 dark:text-gray-300">
                    {t('textReadyMessage')}
                    </p>
                    <p className="text-gray-500 mt-2 opacity-60">
                    {t('fileSize')}: {(processedBlob.size / 1024).toFixed(2)} KB
                    </p>
                </div>
             </div>
          </div>

          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
            <h3 className="text-xl mb-4 font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('processSuccess')}
            </h3>
            
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={handleDownload}
                className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5" />
                </svg>
                {t('download')}
              </button>

              {session && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                    </svg>
                  )}
                  {saving ? t('saving') : t('saveToFiles')}
                </button>
              )}

              <button
                onClick={handleNewProcess}
                className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {t('newProcess')}
              </button>
            </div>

            {!session && (
              <p className="mt-4 text-sm opacity-80">
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