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
import { getMaxUploadBytes } from "@/app/config/fileLimits"; // ✅ Limit settings

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function ExtractPdfPage() {
  const { data: session, status } = useSession();
  const { pdfFile, savePdf } = usePdf();
  const { t } = useLanguage();
  
  const [file, setFile] = useState<File | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [pageRange, setPageRange] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Limit Calculation
  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      const f = acceptedFiles[0];
      // Manual Check
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'File size limit exceeded'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        return;
      }
      setFile(f);
      setProcessedBlob(null);
      setPageRange(""); 
      setError(null);
    }
  }, [maxBytes, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
    maxSize: maxBytes, // ✅ Notify Dropzone of limit
    onDropRejected: (fileRejections) => {
        const rejection = fileRejections[0];
        if (rejection.errors[0].code === "file-too-large") {
            setError(`${t('fileSizeExceeded') || 'File size limit exceeded'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        } else {
            setError(rejection.errors[0].message);
        }
        setFile(null);
    },
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
        if (pdfFile.size > maxBytes) {
            setFile(null);
            setError(`${t('fileSizeExceeded') || 'File size limit exceeded'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
            return;
        }
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
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'File size limit exceeded'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        e.target.value = '';
        return;
      }
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

  // --- 1. EXTRACTION OPERATION ---
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

      const blob = await sendRequest("/files/extract-pages", "POST", formData, true);

      setProcessedBlob(blob);

      const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = file.name.replace('.pdf', `_extracted_${safePageRange}.pdf`);
      savePdf(new File([blob], filename, { type: 'application/pdf' }));

      if (!session) {
        try {
          await guestService.incrementUsage();
        } catch (limitError) {
          console.error("Counter could not be updated:", limitError);
        }
      }

    } catch (e: any) {
      console.error("Page Extraction Error:", e);
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
   };

  // --- 2. SAVE OPERATION ---
  const handleSave = async () => {
    if (!processedBlob || !session) return;
    setSaving(true);
    setError(null);
    try {
      const safePageRange = pageRange.trim().replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = file?.name.replace('.pdf', `_pages_${safePageRange}.pdf`) || 'extracted.pdf';
      
      const fileToSave = new File([processedBlob], filename, { type: 'application/pdf' });
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("filename", filename);

      const result = await sendRequest("/files/save-processed", "POST", formData, true);
      
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      savePdf(fileToSave);

    } catch (e: any) {
      console.error("Save Error:", e);
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

      {/* Buttons */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          {t('selectFile')}
          <input type="file" accept="application/pdf" onChange={handleSelect} className="hidden" />
        </label>
      </div>

      {/* Selected File */}
      {file && (
        <div className="mt-4 text-sm opacity-80">
          {t('selectedFile')} <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
        </div>
      )}

      {/* Process Area */}
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
                className="btn-primary mt-2 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {extracting ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('extracting')}
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                        {t('extractButton')}
                    </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Result */}
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
              <button onClick={handleDownload} className="btn-primary shadow-md hover:scale-105 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5" />
                </svg>
                {t('download')}
              </button>
              
              {session && (
                  <button onClick={handleSave} disabled={saving} className="btn-primary shadow-md hover:scale-105 disabled:opacity-50 flex items-center gap-2">
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
                onClick={handleNew} 
                className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {t('newProcess')}
              </button>
            </div>

            {!session && <p className="mt-4 text-sm opacity-80">💡 <a href="/login" className="underline font-bold" style={{ color: 'var(--button-bg)' }}>{t('loginWarning')}</a></p>}
          </div>
        </div>
      )}

      {error && (
        <div className="error-box mt-6 shadow-sm">
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