"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import dynamic from "next/dynamic";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { useSession } from "next-auth/react";
import { pdfService } from "@/services/pdfService";
import { usePdf } from "@/context/PdfContext";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { guestService } from "@/services/guestService";
import { useLanguage } from "@/context/LanguageContext"; // <--- 1. Import

// PDF bileşenlerini sadece client tarafında import et
const Document = dynamic(() => import("react-pdf").then(mod => mod.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then(mod => mod.Page), { ssr: false });

type PageItem = {
  id: string;
  pageNumber: number;
};

export default function EditPdfPage() {
  const { data: session } = useSession();
  const { pdfFile, savePdf } = usePdf();
  const { t } = useLanguage(); // <--- 2. Hook

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessingDone, setIsProcessingDone] = useState(false);

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    resetState(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent<HTMLButtonElement>) => {
    if (pdfFile) {
      resetState(pdfFile);
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
        e.preventDefault();
      }
    } else {
      setError(t('panelPdfError'));
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      resetState(e.target.files[0]);
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

  const handleDevamEt = () => {
    if (!processedBlob) return;
    savePdf(new File([processedBlob], 'reordered.pdf', { type: 'application/pdf' }));
    alert(t('pdfAddedToPanel'));
    handleReset();
  };

  const handleSave = async () => {
    if (!processedBlob || !session || !file) return;
    setSaving(true);
    setError(null);
    try {
      const apiToken = (session as any)?.apiToken;
      if (!apiToken) throw new Error(t('authRequiredToken'));
      const filename = `reordered_${file.name}`;
      const result = await pdfService.saveProcessed(processedBlob, filename, apiToken);
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      savePdf(new File([processedBlob], filename, { type: 'application/pdf' }));
    } catch (e: any) {
      setError(e?.message || t('saveError'));
    } finally {
      setSaving(false);
    }
  };

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

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/files/reorder`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(t('reorderError'));
      const blob = await response.blob();
      if (blob.size === 0) throw new Error(t('emptyPdfError'));
      setProcessedBlob(blob);
      setIsProcessingDone(true);
    } catch (err: any) {
      setError(t('error') + ": " + err.message);
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
    if (!session) {
      try {
        const result = await guestService.incrementUsage();
        // Opsiyonel: Kullanıcıya limit bilgisi gösterilebilir
      } catch (error) {
        console.error("❌ Misafir kullanım hakkı artırılamadı:", error);
      }
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('editPageTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="mb-4 p-4 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-sm font-medium">
            {usageInfo.message}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200 border border-red-200 dark:border-red-800">
            ⚠️ {error}
        </div>
      )}

      {/* Dropzone */}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            {isDragActive ? <p>{t('editDropActive')}</p> : <p>{t('editDropPassive')}</p>}
        </div>
      </div>

      {/* Butonlar */}
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
              className="px-6 py-3 rounded-xl bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600 font-semibold shadow-md transition-transform hover:scale-105 disabled:opacity-50"
            >
              {t('processAndDownload')}
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold shadow-md transition-transform hover:scale-105"
            >
              {t('newProcess')}
            </button>
          </div>
        </>
      )}

      {isProcessingDone && processedBlob && (
        <div className="mt-8 space-y-6">
          <div className="p-6 rounded-xl border bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-800">
            <h3 className="text-xl mb-4 font-bold">✅ {t('reorderSuccess')}</h3>
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
                onClick={handleDevamEt}
                className="px-6 py-3 rounded-xl bg-yellow-500 dark:bg-yellow-600 text-white hover:bg-yellow-600 dark:hover:bg-yellow-500 font-semibold shadow-md transition-transform hover:scale-105"
              >
                {t('continue')}
              </button>

              <button
                onClick={handleReset}
                className="px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold shadow-md transition-transform hover:scale-105"
              >
                {t('newProcess')}
              </button>
            </div>
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