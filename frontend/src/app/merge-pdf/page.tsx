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

export default function MergePdfPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { pdfFile, savePdf } = usePdf();
  
  const [files, setFiles] = useState<File[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [merging, setMerging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      setFiles(prev => [...prev, ...acceptedFiles]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prev => [...prev, ...newFiles]);
      setError(null);
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setProcessedBlob(null);
    setError(null);
  };

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
        const isAlreadyInList = files.some(f => f.name === pdfFile.name && f.size === pdfFile.size);

        if (!isAlreadyInList) {
            setFiles(prev => [...prev, pdfFile]);
            setError(null);
            if (e && 'stopPropagation' in e) { 
                e.stopPropagation(); 
                e.preventDefault();
            }
        } else {
            setError(`"${pdfFile.name}" ${t('fileAlreadyInList')}`);
        }
    } else {
        setError(t('panelPdfError'));
    }
  };

  const handleMergePdfs = async () => {
    if (files.length < 2) {
      setError(t('mergeMinFilesError'));
      return;
    }

    const canProceed = await checkLimit();
    if (!canProceed) return;

    setError(null);
    setMerging(true);

    try {
      const formData = new FormData();
      files.forEach(file => formData.append("files", file));

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/files/merge-pdfs`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || t('mergeFailed'));
      }

      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Received empty blob from server");

      setProcessedBlob(blob);

      const mergedFile = new File([blob], "merged.pdf", { type: "application/pdf" });
      savePdf(mergedFile);

    } catch (e: any) {
      console.error("❌ Birleştirme Hatası:", e);
      setError(e?.message || t('unknownMergeError'));
    } finally {
      setMerging(false);
    }
  };

  const handleDownload = async () => {
    if (!processedBlob) return;

    const url = window.URL.createObjectURL(processedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merged.pdf";
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
      
      const filename = "merged.pdf";
      const fileToSave = new File([processedBlob], filename, { type: "application/pdf" });
      
      const result = await pdfService.saveProcessed(fileToSave, filename, apiToken);
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      
      savePdf(new File([processedBlob], filename, { type: "application/pdf" }));
      clearFiles();
    } catch (e: any) {
      console.error("❌ Save error:", e);
      setError(e?.message || t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const isReady = files.length >= 2;
  const hasProcessed = processedBlob !== null;

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('mergePageTitle')}</h1>

      {/* ✅ DÜZELTME 1: Misafir Uyarısı
         Artık 'globals.css' içindeki '.info-box' sınıfını kullanıyor.
         Açık modda koyu lacivert yazı, koyu modda açık mavi yazı olacak.
      */}
      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
            {usageInfo.message}
        </div>
      )}

      {!hasProcessed && (
        <>
          {/* ✅ DÜZELTME 2: Dropzone 
             container-card ile uyumlu ama border-dashed ile özelleşmiş yapı.
          */}
          <div
            {...getRootProps()}
            onDrop={handleDropFromPanel}
            className={`container-card border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-300
              ${isDragActive 
                ? "border-[var(--button-bg)] opacity-80 bg-[var(--background)]" 
                : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
              }`}
          >
            <input {...getInputProps()} />
             <div className="flex flex-col items-center gap-3">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v8.25A2.25 2.25 0 006 16.5h2.25m8.25-8.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-7.5A2.25 2.25 0 018.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 00-2.25 2.25v6" />
                </svg>
                {isDragActive ? <p>{t('dropFilesActive')}</p> : <p>{t('dropFilesPassive')}</p>}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="btn-primary cursor-pointer shadow-md hover:scale-105">
              {t('selectFile')}
              <input type="file" accept="application/pdf" onChange={handleSelect} multiple className="hidden" />
            </label>
            
            {/* Panelden Ekle Butonu KALDIRILDI */}
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg opacity-90">{t('selectedFiles')} ({files.length})</h2>
                <button onClick={clearFiles} className="text-sm text-red-500 hover:text-red-400 font-medium bg-transparent shadow-none border-none p-0">{t('clearAll')}</button>
              </div>
              <ul className="container-card space-y-2 p-4">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex justify-between items-center text-sm font-normal opacity-90">
                    <span>{index + 1}. {file.name} ({Math.round(file.size / 1024)} KB)</span>
                    <button onClick={() => removeFile(index)} className="px-2 py-1 text-xs text-red-500 hover:text-red-400 bg-transparent shadow-none border-none">{t('remove')}</button>
                  </li>
                ))}
              </ul>
              <p className="text-sm opacity-50 font-normal mt-2">{t('mergeOrderHint')}</p>
            </div>
          )}

          <button 
            onClick={handleMergePdfs} 
            disabled={!isReady || merging} 
            className="btn-primary mt-6 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {merging ? t('merging') : t('mergeButton')}
          </button>
        </>
      )}

      {hasProcessed && (
        <div className="mt-6 space-y-6">
          
          <div className="container-card p-6">
            <h3 className="text-xl mb-4 font-semibold">{t('mergedPdfPreview')}</h3>
            <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
                <PdfViewer file={new File([processedBlob], "merged.pdf", { type: "application/pdf" })} height={550} />
            </div>
          </div>

          {/* ✅ DÜZELTME 3: Çizgi/Border
             container-card global.css'te border tanımlı, ama ek olarak burada belirginleştirdik.
          */}
          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
            <h3 className="text-xl mb-4 font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('mergeSuccessTitle')}
            </h3>
            
            <div className="flex gap-4 flex-wrap">
              <button onClick={handleDownload} className="btn-primary shadow-md hover:scale-105">
                {t('download')}
              </button>
              
              {session && (
                  <button onClick={handleSave} disabled={saving} className="btn-primary shadow-md hover:scale-105 disabled:opacity-50">
                    {saving ? t('saving') : t('save')}
                  </button>
              )}
              
              {/* ✅ DÜZELTME 4: Yeni İşlem Butonu
                 Tamamen btn-primary stilinde.
              */}
              <button 
                onClick={clearFiles} 
                className="btn-primary shadow-md hover:scale-105"
              >
                {t('newProcess')}
              </button>
            </div>

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