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
import { useLanguage } from "@/context/LanguageContext"; // <--- 1. Import

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function ExtractTextPage() {
  const { data: session } = useSession();
  const { pdfFile } = usePdf();
  const { t } = useLanguage(); // <--- 2. Hook

  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      resetFileState(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) { 
        resetFileState(pdfFile);
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
      resetFileState(f);
    }
    e.target.value = ''; 
  };
  
  const handleNewProcess = () => {
    setProcessedBlob(null);
    setFile(null);
    setError(null);
  };

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

      // API URL'ini güvenli hale getir
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/files/convert-text`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || t('error'));
      }

      const blob = await response.blob();
      setProcessedBlob(blob);
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
  
     if (!session) {
       try {
         await guestService.incrementUsage();
       } catch (error) {
         console.error("❌ Could not increment guest usage:", error);
       }
     }
   };

  const handleSave = async () => {
    if (!processedBlob || !session) return;
    setSaving(true);
    setError(null);
    try {
      const apiToken = (session as any)?.apiToken;
      if (!apiToken) throw new Error(t('authRequiredToken'));
      const filename = file?.name.replace('.pdf', '_converted.txt') || 'converted.txt';
      const result = await pdfService.saveProcessed(processedBlob, filename, apiToken);
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

      {/* Usage Info */}
      {usageInfo && !showLimitModal && !session && (
        <div className="mb-4 p-4 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-sm font-medium">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone (Sürükle-Bırak) */}
      <div
        {...getRootProps()}
        onDrop={handleDropFromPanel} 
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${isDragActive 
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80" 
            : "border-[var(--navbar-border)] bg-[var(--container-bg)] hover:border-[var(--button-bg)]"
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

      {/* Dosya Seç Butonu ve Panel Butonu */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label 
            className="cursor-pointer inline-flex items-center justify-center px-6 py-3 rounded-xl font-bold transition-transform hover:scale-105 shadow-md"
            style={{ backgroundColor: 'var(--button-bg)', color: 'var(--button-text)' }}
        >
          {t('selectFile')}
          <input type="file" accept="application/pdf" onChange={handleSelect} className="hidden" />
        </label>
        
        {pdfFile && file !== pdfFile && (
            <button 
                onClick={() => handleDropFromPanel()} 
                className="px-6 py-3 rounded-xl border transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{
                    backgroundColor: 'transparent',
                    borderColor: 'var(--navbar-border)',
                    color: 'var(--foreground)'
                }}
            >
              {t('usePanelFile')}
            </button>
        )}
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
          className="mt-6 w-full sm:w-auto px-8 py-3 rounded-xl shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--button-bg)', color: 'var(--button-text)' }}
        >
          {converting ? t('converting') : t('convertText')}
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
                    <p className="text-gray-500 mt-2">
                    {t('fileSize')}: {(processedBlob.size / 1024).toFixed(2)} KB
                    </p>
                </div>
             </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 rounded-xl border bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-800">
            <h3 className="text-xl mb-4 font-bold">{t('processSuccess')}</h3>
            
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={handleDownload}
                className="px-6 py-3 rounded-xl bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600 font-semibold shadow-md transition-transform hover:scale-105"
              >
                {t('download')}
              </button>

              {session && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-3 rounded-xl bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-600 font-semibold shadow-md transition-transform hover:scale-105 disabled:opacity-50"
                >
                  {saving ? t('saving') : t('saveToFiles')}
                </button>
              )}

              <button
                onClick={handleNewProcess}
                className="px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold shadow-md transition-transform hover:scale-105"
              >
                {t('newProcess')}
              </button>
            </div>

            {!session && (
              <p className="mt-4 text-sm opacity-80">
                💡 <a href="/login" className="underline font-bold">{t('loginWarning')}</a>
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800">
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