"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import dynamic from "next/dynamic";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { useSession } from "next-auth/react";
import { usePdf } from "@/context/PdfContext";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { guestService } from "@/services/guestService";
import { useLanguage } from "@/context/LanguageContext";
import { sendRequest } from "@/utils/api";
import { getMaxUploadBytes } from "@/app/config/fileLimits"; // ✅ Limit ayarı

const Document = dynamic(() => import("react-pdf").then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then(mod => mod.Page), { ssr: false });

type PageItem = {
  id: string;
  pageNumber: number;
};

export default function EditPdfPage() {
  const { data: session, status } = useSession();
  const { pdfFile, savePdf } = usePdf();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessingDone, setIsProcessingDone] = useState(false);

  // ✅ Limit Hesaplama
  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const resetState = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setObjectUrl(url);
    setPages([]);
    setNumPages(0);
    setError(null);
    setIsProcessingDone(false);
    setProcessedBlob(null);
  };

  // --- DROPZONE AYARLARI ---
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      const f = acceptedFiles[0];
      // Manuel Kontrol
      if (f.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        return;
      }
      resetState(f);
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

  // --- YAN PANEL KONTROLÜ ---
  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
      if (pdfFile.size > maxBytes) {
        setFile(null);
        setError(`${t('fileSizeExceeded') || 'Dosya boyutu sınırı aşıldı'} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`);
        return;
      }
      resetState(pdfFile);
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
      resetState(f);
    }
    e.target.value = '';
  };

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPages(
      Array.from({ length: numPages }, (_, i) => ({
        id: `page-${i + 1}`,
        pageNumber: i + 1,
      }))
    );
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const newPages = Array.from(pages);
    const [removed] = newPages.splice(result.source.index, 1);
    newPages.splice(result.destination.index, 0, removed);
    setPages(newPages);
    setIsProcessingDone(false);
    setProcessedBlob(null);
  };

  const handleReset = () => {
    setFile(null);
    setObjectUrl(null);
    setPages([]);
    setNumPages(0);
    setIsProcessingDone(false);
    setProcessedBlob(null);
    setError(null);
  };

  // --- 1. REORDER İŞLEMİ ---
  const handleProcessAndDownload = async () => {
    if (!file) {
      setError(t('selectPdfFirst'));
      return;
    }
    const canProceed = await checkLimit();
    if (!canProceed) return;
    
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const pageOrder = pages.map(p => p.pageNumber).join(",");
      formData.append("page_numbers", pageOrder);

      const blob = await sendRequest("/files/reorder", "POST", formData, true);

      if (blob.size === 0) throw new Error(t('emptyPdfError'));
      
      setProcessedBlob(blob);
      setIsProcessingDone(true);

      savePdf(new File([blob], `reordered_${file.name}`, { type: 'application/pdf' }));

      if (!session) {
        try {
            await guestService.incrementUsage();
        } catch (error) {
            console.error("Misafir sayaç hatası:", error);
        }
      }

    } catch (err: any) {
      console.error("Reorder Error:", err);
      setError(t('error') + ": " + (err.message || "İşlem başarısız"));
    }
  };

  // --- 2. KAYDETME İŞLEMİ ---
  const handleSave = async () => {
    if (!processedBlob || !session || !file) return;
    setSaving(true);
    setError(null);
    try {
      const filename = `reordered_${file.name}`;
      const fileToSave = new File([processedBlob], filename, { type: "application/pdf" });
      
      const formData = new FormData();
      formData.append("file", fileToSave);
      formData.append("filename", filename);

      const result = await sendRequest("/files/save-processed", "POST", formData, true);
      
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      
      savePdf(fileToSave);
      handleReset(); 

    } catch (e: any) {
      console.error("Save Error:", e);
      setError(e?.message || t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!processedBlob || !file) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reordered_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('editPageTitle')}</h1>

      {/* Usage Info */}
      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
            {usageInfo.message}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            {isDragActive ? <p>{t('editDropActive')}</p> : <p>{t('editDropPassive')}</p>}
        </div>
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

      {objectUrl && !isProcessingDone && (
        <>
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4 opacity-90">{t('previewDragDrop')} ({pages.length} {t('page')})</h3>
            
            {/* Document Bileşeni */}
            <Document
              file={objectUrl}
              onLoadSuccess={handleLoadSuccess}
              loading={<div className="p-6">{t('loading')}</div>}
              error={<div className="p-6 text-red-500">{t('pdfError')}</div>}
              className="flex justify-center"
            >
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="pages" direction="vertical">
                  {(provided: any) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex flex-col gap-6 p-4 items-center w-full"
                    >
                      {pages.map((p, index) => (
                        <Draggable key={p.id} draggableId={p.id} index={index}>
                          {(provided: any) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              // KART STİLİ
                              className="border rounded-xl overflow-hidden shadow-lg cursor-move transition-shadow hover:shadow-2xl"
                              style={{ 
                                width: "100%", 
                                maxWidth: 300, 
                                backgroundColor: 'var(--container-bg)', 
                                borderColor: 'var(--container-border)',
                                color: 'var(--foreground)',
                                ...provided.draggableProps.style 
                              }}
                            >
                              {/* KART BAŞLIĞI */}
                              <div 
                                className="text-center text-sm py-2 border-b font-bold tracking-wide"
                                style={{ 
                                    backgroundColor: 'var(--background)',
                                    borderColor: 'var(--navbar-border)'
                                }}
                              >
                                {t('orderIndex')}: {index + 1} ({t('origPage')} {p.pageNumber})
                              </div>
                              
                              <div className="flex justify-center bg-gray-200 dark:bg-gray-800 p-2">
                                <Page
                                    pageNumber={p.pageNumber}
                                    width={250}
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                    className="shadow-sm"
                                />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </Document>
          </div>

          <div className="mt-8 flex gap-4 flex-wrap justify-center sm:justify-start">
            <button
              onClick={handleProcessAndDownload}
              disabled={pages.length === 0}
              className="btn-primary shadow-lg hover:scale-105 disabled:opacity-50 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5" />
              </svg>
              {t('processAndDownload')}
            </button>
            <button
              onClick={handleReset}
              className="btn-primary shadow-md hover:scale-105 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {t('newProcess')}
            </button>
          </div>
        </>
      )}

      {isProcessingDone && processedBlob && (
        <div className="mt-8 space-y-6">
          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
            <h3 className="text-xl mb-4 font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('reorderSuccess')}
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
                onClick={handleReset}
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