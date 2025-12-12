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

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });
const MarkdownViewer = dynamic(() => import("@/components/MarkdownViewer"), { ssr: false });

export default function SummarizePdfPage() {
  const { data: session } = useSession();
  const { pdfFile } = usePdf();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) {
      setFile(acceptedFiles[0]);
      setSummary("");
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement>) => {
    if (pdfFile) {
      setFile(pdfFile);
      setSummary("");
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
      setSummary("");
      setError(null);
    }
    e.target.value = '';
  };

  const handleSummarize = async () => {
    if (!file) {
      setError(t('uploadFirst'));
      return;
    }

    if (!session) {
      const canProceed = await checkLimit();
      if (!canProceed) return;
    }

    setError(null);
    setSummarizing(true); // Yükleniyor sahnesini başlat

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = (session as any)?.apiToken || (session as any)?.user?.accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/files/summarize`, {
        method: 'POST',
        body: formData,
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || t('summarizeFailed'));
      }

      const data = await response.json();
      setSummary(data.summary);

      if (!session) {
        try {
            await guestService.incrementUsage();
        } catch (limitError) {
            console.error("Sayaç güncellenemedi:", limitError);
        }
      }

    } catch (e: any) {
      console.error("PDF Özetleme Hatası:", e);
      setError(e?.message || t('error'));
    } finally {
      setSummarizing(false); // Yükleniyor sahnesini kapat
    }
  };

  const handleDownloadPdf = async () => {
    if (!summary) return;
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = (session as any)?.apiToken || (session as any)?.user?.accessToken;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json', 
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/files/markdown-to-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ markdown: summary }), 
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'PDF indirilemedi');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "summary.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (e: any) {
      console.error("PDF İndirme Hatası:", e);
      setError(e?.message || 'Hata oluştu');
    }
  };

  const handleNew = () => {
    setFile(null);
    setSummary("");
    setError(null);
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)] relative">
      
      {/* Yükleniyor Ara Sahnesi (Overlay) */}
      {summarizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
            <div className="flex flex-col items-center justify-center p-8 rounded-2xl shadow-2xl border border-[var(--navbar-border)]"
                 style={{ backgroundColor: 'var(--container-bg)' }}>
                
                {/* Dönen Çember */}
                <div className="relative w-20 h-20">
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-[var(--navbar-border)] rounded-full opacity-30"></div>
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-t-[var(--button-bg)] rounded-full animate-spin"></div>
                </div>

                {/* ✅ Çeviri: 'Özetleniyor...' */}
                <h2 className="mt-6 text-2xl font-bold tracking-tight animate-pulse" style={{ color: 'var(--foreground)' }}>
                    {t('summarizing')}...
                </h2>
                
                {/* ✅ Çeviri: Bekleme Mesajı */}
                <p className="mt-2 text-sm font-medium opacity-60 max-w-xs text-center" style={{ color: 'var(--foreground)' }}>
                    {t('waitMessage')} 
                </p>
            </div>
        </div>
      )}

      <h1 className="text-3xl mb-6 tracking-tight">{t('summarizeTitle')}</h1>

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
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80"
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
          }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {isDragActive ? <p>{t('dropActive')}</p> : <p>{t('dropPassive')}</p>}
        </div>
        
        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b> <br/> {t('changeFileHint')}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-start">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105">
          {t('selectFile')}
          <input type="file" className="hidden" accept=".pdf" onChange={handleSelect} />
        </label>
      </div>

      {file && !summary && (
        <div className="mt-6 space-y-6">
            <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
                <div className="p-4 border-b border-[var(--navbar-border)]" style={{ backgroundColor: 'var(--container-bg)' }}>
                <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
                </div>
                <PdfViewer file={file} height={550} />
            </div>

            <button
                onClick={handleSummarize}
                // Özetleme sırasında butonu disable ediyoruz (Overlay zaten kapatacak ama güvenlik önlemi)
                disabled={summarizing}
                className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {t('summarizeButton')}
            </button>
        </div>
      )}

      {summary && (
        <div className="mt-6 space-y-6">
          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
             <h3 className="text-xl mb-4 font-semibold border-b border-[var(--navbar-border)] pb-2">{t('summaryResultTitle') || "Özet Sonucu"}</h3>
             <MarkdownViewer markdown={summary} height={400} />
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
                onClick={handleDownloadPdf}
                className="btn-primary shadow-md hover:scale-105"
                >
                {t('downloadPdf')}
                </button>
                
                <button
                onClick={handleNew}
                className="btn-primary shadow-md hover:scale-105"
                >
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