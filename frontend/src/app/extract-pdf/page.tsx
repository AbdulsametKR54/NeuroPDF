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

export default function ExtractPdfPage() {
  const { data: session } = useSession();
  const { pdfFile, savePdf } = usePdf();
  const { t } = useLanguage();
  
  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [pageRange, setPageRange] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      setFile(acceptedFiles[0]);
      setProcessedBlob(null);
      setPageRange(""); 
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
        setFile(pdfFile);
        setProcessedBlob(null);
        setPageRange(""); 
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
      setProcessedBlob(null);
      setPageRange(""); 
      setError(null);
    }
    e.target.value = ''; 
  };

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageRange(e.target.value);
  };

  const handleExtractPages = async () => {
    if (!file) {
      setError(t('uploadFirst'));
      return;
    }
    if (!pageRange.trim()) {
      setError(t('enterPageRangeError'));
      return;
    }

    const canProceed = await checkLimit();
    if (!canProceed) return;

    setError(null);
    setExtracting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('page_range', pageRange.trim());

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/files/extract-pages`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || t('extractionFailed'));
      }

      const blob = await response.blob();
      setProcessedBlob(blob);

      const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = file.name.replace('.pdf', `_extracted_${safePageRange}.pdf`);
      savePdf(new File([blob], filename, { type: 'application/pdf' }));

    } catch (e: any) {
      console.error("Sayfa Çıkarma Hatası:", e);
      setError(e?.message || t('error'));
    } finally {
      setExtracting(false);
    }
  };

   const handleDownload = async () => {
     if (!processedBlob) return;
     const url = window.URL.createObjectURL(processedBlob);
     const a = document.createElement("a");
     a.href = url;
     a.download = "extracted.pdf";
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
      
      const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = file?.name.replace('.pdf', `_pages_${safePageRange}.pdf`) || 'extracted.pdf';
      
      const result = await pdfService.saveProcessed(processedBlob, filename, apiToken);
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      
      savePdf(new File([processedBlob], filename, { type: 'application/pdf' }));
    } catch (e: any) {
      setError(e?.message || t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleNew = () => {
    setFile(null);
    setProcessedBlob(null);
    setPageRange("");
    setError(null);
  };

  const isReady = file && pageRange.trim().length > 0;
  const hasProcessed = processedBlob !== null;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('extractPageTitle')}</h1>

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
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            {isDragActive ? 
            <p>{t('extractDropActive')}</p> : 
            <p>{t('extractDropPassive')}</p>
            }
        </div>

        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b> <br/> {t('changeFileHint')}
          </p>
        )}
      </div>

      {/* Butonlar */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105">
          {t('selectFile')}
          <input type="file" accept="application/pdf" onChange={handleSelect} className="hidden" />
        </label>
      </div>

      {/* Seçilen Dosya */}
      {file && (
        <div className="mt-4 text-sm opacity-80">
          {t('selectedFile')} <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
        </div>
      )}

      {/* İşlem Alanı */}
      {file && (
        <>
          {!hasProcessed && (
            <div className="mt-6 rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
              <div className="p-4 border-b border-[var(--navbar-border)]" style={{ backgroundColor: 'var(--container-bg)' }}>
                <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
              </div>
              <PdfViewer file={file} height={550} />
            </div>
          )}

          {!hasProcessed && (
            <div className="mt-6 flex flex-col gap-3">
              <label htmlFor="pageRange" className="text-lg font-bold">{t('pagesToExtractLabel')}</label>
              
              <input
                id="pageRange"
                type="text"
                placeholder={t('pageRangePlaceholder')}
                value={pageRange}
                onChange={handleRangeChange}
                className="px-4 py-3 rounded-xl border focus:ring-2 outline-none transition-colors"
                style={{
                    backgroundColor: 'var(--container-bg)',
                    color: 'var(--foreground)',
                    borderColor: 'var(--navbar-border)',
                    '--tw-ring-color': 'var(--button-bg)'
                } as React.CSSProperties}
              />
              
              <p className="text-sm opacity-60 font-normal">
                {t('pageRangeHint')}
              </p>
              
              <button
                onClick={handleExtractPages}
                disabled={!isReady || extracting}
                className="btn-primary mt-2 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? t('extracting') : t('extractButton')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Sonuç */}
      {hasProcessed && processedBlob && (
        <div className="mt-6 space-y-6">
          
          <div className="container-card p-6">
            <h3 className="text-xl mb-4 font-semibold">{t('extractedPdfPreviewTitle')}</h3>
            <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
                <PdfViewer 
                    file={new File([processedBlob], file?.name.replace('.pdf', '_extracted.pdf') || 'extracted.pdf', { type: 'application/pdf' })} 
                    height={550} 
                />
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
              <button onClick={handleDownload} className="btn-primary shadow-md hover:scale-105">
                {t('download')}
              </button>
              
              {session && (
                  <button onClick={handleSave} disabled={saving} className="btn-primary shadow-md hover:scale-105 disabled:opacity-50">
                    {saving ? t('saving') : t('saveToFiles')}
                  </button>
              )}
              
              <button 
                onClick={handleNew} 
                className="btn-primary shadow-md hover:scale-105"
              >
                {t('newProcess')}
              </button>
            </div>

            {/* ✅ EKLENDİ: Misafir Kullanıcı Giriş Uyarısı Linki */}
            {!session && <p className="mt-4 text-sm opacity-80">💡 <a href="/login" className="underline font-bold" style={{ color: 'var(--button-bg)' }}>{t('loginWarning')}</a></p>}
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