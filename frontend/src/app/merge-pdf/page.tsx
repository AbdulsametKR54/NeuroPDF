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
import { getMaxUploadBytes } from "@/app/config/fileLimits";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

// Maksimum TOPLAM dosya boyutu limiti (Örn: 50MB)
const MAX_TOTAL_SIZE_MB = 50;
const MAX_TOTAL_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;

// ✅ Hata Kodları (INVALID_TYPE eklendi)
type ErrorType = "NONE" | "INVALID_TYPE" | "SIZE_EXCEEDED" | "TOTAL_SIZE_EXCEEDED" | "CUSTOM" | "MERGE_MIN_FILES" | "PANEL_ERROR" | "FILE_ALREADY_IN_LIST" | "MERGE_ERROR" | "SAVE_ERROR";

export default function MergePdfPage() {
  const { data: session, status } = useSession();
  const { t, language } = useLanguage(); 
  const { pdfFile, savePdf } = usePdf();
  
  const [files, setFiles] = useState<File[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [merging, setMerging] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [errorType, setErrorType] = useState<ErrorType>("NONE");
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== "authenticated";
  const maxBytesPerFile = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const clearError = () => {
    setErrorType("NONE");
    setCustomErrorMsg(null);
  };

  const clearFiles = () => {
    setFiles([]);
    setProcessedBlob(null);
    clearError();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --- DROPZONE AYARLARI ---
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    clearError();

    // Hata Kontrolü
    if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const errorObj = rejection.errors[0];

        // ✅ DÜZELTME BURADA: İngilizce mesajı yakalayıp kendi kodumuza çeviriyoruz
        if (errorObj.code === "file-invalid-type") {
            setErrorType("INVALID_TYPE");
        } else if (errorObj.code === "file-too-large") {
            setErrorType("SIZE_EXCEEDED");
        } else {
            // Bilinmeyen diğer hatalar için kütüphane mesajı (CUSTOM)
            setErrorType("CUSTOM");
            setCustomErrorMsg(errorObj.message);
        }
        return; 
    }

    if (!acceptedFiles?.length) return;

    const newFiles: File[] = [];
    let currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);

    for (const file of acceptedFiles) {
        // Çift Güvenlik (Manuel Type Kontrolü)
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
             setErrorType("INVALID_TYPE");
             return;
        }

        if (file.size > maxBytesPerFile) {
            setErrorType("SIZE_EXCEEDED");
            return;
        }
        
        if (currentTotalSize + file.size > MAX_TOTAL_BYTES) {
            setErrorType("TOTAL_SIZE_EXCEEDED");
            return;
        }

        newFiles.push(file);
        currentTotalSize += file.size;
    }

    setFiles(prev => [...prev, ...newFiles]);
  }, [files, maxBytesPerFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { "application/pdf": [".pdf"] },
    maxSize: maxBytesPerFile,
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
        const newFilesList = Array.from(selectedFiles);
        onDrop(newFilesList, []); 
    }
    e.target.value = '';
  };

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    clearError();
    if (pdfFile) {
        // Panelden gelen dosya için de tip kontrolü
        if (pdfFile.type !== "application/pdf" && !pdfFile.name.toLowerCase().endsWith(".pdf")) {
            setErrorType("INVALID_TYPE");
            return;
        }

        if (pdfFile.size > maxBytesPerFile) {
            setErrorType("SIZE_EXCEEDED");
            return;
        }

        const currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);
        if (currentTotalSize + pdfFile.size > MAX_TOTAL_BYTES) {
            setErrorType("TOTAL_SIZE_EXCEEDED");
            return;
        }

        const isAlreadyInList = files.some(f => f.name === pdfFile.name && f.size === pdfFile.size);

        if (!isAlreadyInList) {
            setFiles(prev => [...prev, pdfFile]);
            if (e && 'stopPropagation' in e) { 
                e.stopPropagation(); 
                e.preventDefault();
            }
        } else {
            setErrorType("FILE_ALREADY_IN_LIST");
            setCustomErrorMsg(pdfFile.name);
        }
    } else {
        setErrorType("PANEL_ERROR");
    }
  };

  // --- MERGE İŞLEMİ ---
  const handleMergePdfs = async () => {
    if (files.length < 2) {
      setErrorType("MERGE_MIN_FILES");
      return;
    }

    const canProceed = await checkLimit();
    if (!canProceed) return;

    clearError();
    setMerging(true);

    try {
      const formData = new FormData();
      files.forEach(file => formData.append("files", file));

      const blob = await sendRequest("/files/merge-pdfs", "POST", formData, true);

      if (blob.size === 0) throw new Error("Received empty blob from server");

      setProcessedBlob(blob);

      const mergedFile = new File([blob], "merged.pdf", { type: "application/pdf" });
      savePdf(mergedFile);

      if (!session) {
        try {
            await guestService.incrementUsage();
        } catch (error) {
            console.error("Misafir sayaç hatası:", error);
        }
      }

    } catch (e: any) {
      console.error("❌ Birleştirme Hatası:", e);
      setErrorType("MERGE_ERROR");
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
  };

  // --- KAYDETME İŞLEMİ ---
  const handleSave = async () => {
    if (!processedBlob || !session) return;
    setSaving(true);
    clearError();
    try {
      const filename = "merged.pdf";
      const fileToSave = new File([processedBlob], filename, { type: "application/pdf" });
      
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("filename", filename);

      const result = await sendRequest("/files/save-processed", "POST", formData, true);
      
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      clearFiles();

    } catch (e: any) {
      console.error("❌ Save error:", e);
      setErrorType("SAVE_ERROR");
    } finally {
      setSaving(false);
    }
  };

  const isReady = files.length >= 2;
  const hasProcessed = processedBlob !== null;

  // ✅ Hata Mesajı Renderlayıcı (Dil değişince burası yeniden çalışır)
  const getErrorMessage = () => {
    if (errorType === "CUSTOM" && customErrorMsg) return customErrorMsg;

    switch (errorType) {
        case "INVALID_TYPE": return t("invalidFileType"); // ✅ Artık çeviri dönecek
        case "SIZE_EXCEEDED": 
            return `${t("fileSizeExceeded")} (Max: ${(maxBytesPerFile / (1024 * 1024)).toFixed(0)} MB)`;
        case "TOTAL_SIZE_EXCEEDED":
            return `${t("totalSizeExceeded")} (Max: ${MAX_TOTAL_SIZE_MB}MB)`;
        case "PANEL_ERROR": return t("panelPdfError");
        case "MERGE_MIN_FILES": return t("mergeMinFilesError");
        case "FILE_ALREADY_IN_LIST": return `"${customErrorMsg}" ${t("fileAlreadyInList")}`;
        case "MERGE_ERROR": return t("unknownMergeError");
        case "SAVE_ERROR": return t("saveError");
        default: return null;
    }
  };

  const currentError = getErrorMessage();

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('mergePageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
            {usageInfo.message}
        </div>
      )}

      {!hasProcessed && (
        <>
          {/* Dropzone Alanı */}
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

          {/* Dosya Seç Butonu */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t('selectFile')}
              <input type="file" accept="application/pdf" onChange={handleSelect} multiple className="hidden" />
            </label>
          </div>

         {/* DOSYA LİSTESİ */}
          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg opacity-90" style={{ color: "var(--foreground)" }}>
                  {t('selectedFiles')} ({files.length})
                </h2>

                <button
                  onClick={clearFiles}
                  className="flex items-center gap-1 text-sm font-semibold bg-transparent shadow-none border-none p-2 rounded transition-colors"
                  style={{ color: "var(--danger-action-text)" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79" />
                  </svg>
                  {t('clearAll')}
                </button>
              </div>

              <ul className="container-card space-y-2 p-4">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex justify-between items-center text-sm font-medium p-3 rounded-lg transition-all duration-200"
                    style={{
                      border: "1px solid var(--container-border)",
                      backgroundColor: "var(--container-bg)",
                      color: "var(--foreground)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs w-4 opacity-70" style={{ color: "var(--foreground)" }}>
                        {index + 1}.
                      </span>
                      <div className="flex flex-col">
                        <span className="font-bold" style={{ color: "var(--foreground)" }}>{file.name}</span>
                        <span className="text-xs opacity-70" style={{ color: "var(--foreground)" }}>({Math.round(file.size / 1024)} KB)</span>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFile(index)}
                      className="p-2 rounded-full bg-transparent shadow-none transition-all"
                      style={{ color: "var(--danger-action-text)" }}
                      title={t('remove')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>

              <p className="text-sm opacity-50 font-normal mt-2" style={{ color: "var(--foreground)" }}>
                {t('mergeOrderHint')}
              </p>
            </div>
          )}

          {/* Merge Butonu */}
          <button 
            onClick={handleMergePdfs} 
            disabled={!isReady || merging} 
            className="btn-primary mt-6 w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {merging ? (
                <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('merging')}
                </>
            ) : (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    {t('mergeButton')}
                </>
            )}
          </button>
        </>
      )}

      {/* ✅ HATA KUTUSU */}
      {currentError && (
        <div className="error-box mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>{currentError}</span>
        </div>
      )}

      {hasProcessed && processedBlob && (
        <div className="mt-6 space-y-6">
          <div className="container-card p-6">
            <h3 className="text-xl mb-4 font-semibold">{t('mergedPdfPreview')}</h3>
            <div className="rounded-lg overflow-hidden border border-[var(--navbar-border)]">
                <PdfViewer file={new File([processedBlob], "merged.pdf", { type: "application/pdf" })} height={550} />
            </div>
          </div>

          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
            <h3 className="text-xl mb-4 font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('mergeSuccessTitle')}
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
                    {saving ? t('saving') : t('save')}
                  </button>
              )}
              
              <button onClick={clearFiles} className="btn-primary shadow-md hover:scale-105 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                {t('newProcess')}
              </button>
            </div>

            {!session && <p className="mt-4 text-sm opacity-80">💡 <a href="/login" className="underline font-bold" style={{ color: 'var(--button-bg)' }}>{t('loginWarning')}</a></p>}
          </div>
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