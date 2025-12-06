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

  const handleDropFromPanel = (e?: any) => {
    if (pdfFile) {
      setFile(pdfFile);
      setSummary("");
      setError(null);
      e?.stopPropagation();
      e?.preventDefault();
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
    setSummarizing(true);

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
    } catch (e: any) {
      console.error("PDF Özetleme Hatası:", e);
      setError(e?.message || t('error'));
    } finally {
      setSummarizing(false);
    }
  };

  const pdfİndir = async () => {
    if (!summary) return;
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = (session as any)?.apiToken || (session as any)?.user?.accessToken;
      
      // ✅ HEADER GÜNCELLEMESİ (JSON GÖNDERECEĞİMİZİ BELİRTİYORUZ)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json', 
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${apiUrl}/files/markdown-to-pdf`, {
        method: 'POST',
        headers,
        // ✅ BODY GÜNCELLEMESİ (JSON FORMATINDA GÖNDERİYORUZ)
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

      if (!session) {
        try { await guestService.incrementUsage(); } catch (error) { console.error(error); }
      }

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
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">
      <h1 className="text-3xl mb-6 tracking-tight">{t('summarizeTitle')}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="mb-4 p-4 rounded-xl bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-sm font-medium">
          {usageInfo.message}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {isDragActive ? <p>{t('dropActive')}</p> : <p>{t('dropPassive')}</p>}
        </div>
        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b> <br/> {t('changeFileHint')}
          </p>
        )}
      </div>

      {/* PDF Yükle Butonu */}
      <div className="mt-4 flex justify-start">
        <label
          className="cursor-pointer px-6 py-3 rounded-xl font-semibold transition text-white hover:opacity-90"
          style={{ backgroundColor: "var(--button-bg)", color: "var(--button-text)" }}
        >
          PDF Yükle
          <input type="file" className="hidden" accept=".pdf" onChange={handleSelect} />
        </label>
      </div>

      {/* PDF Viewer ve Özetle Butonu */}
      {file && !summary && (
      <div className="mt-6 rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg max-w-[700px]">
        <div className="p-4 border-b border-[var(--navbar-border)]" style={{ backgroundColor: 'var(--container-bg)' }}>
          <h3 className="text-xl font-semibold opacity-90">{t('pdfPreviewTitle')}</h3>
        </div>
        <PdfViewer file={file} height={550} />

        <div className="mt-4 flex gap-4 flex-wrap justify-start">
          <button
            onClick={handleSummarize}
            disabled={summarizing}
            className="px-6 py-3 rounded-xl font-semibold shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--button-bg)",
              color: "var(--button-text)"
            }}
          >
            {summarizing ? t('summarizing') : t('summarizeButton')}
          </button>
        </div>
      </div>
    )}

      {/* MarkdownViewer ve PDF indir / Yeni işlem */}
      {summary && (
        <div className="mt-6 space-y-4 max-w-[700px]">
          <MarkdownViewer markdown={summary} height={400} />
          <div className="flex gap-4 flex-wrap justify-start">
            <button
              onClick={pdfİndir}
              className="px-6 py-3 rounded-xl font-semibold shadow-md transition-transform hover:scale-105"
              style={{
                backgroundColor: "var(--button-bg)",
                color: "var(--button-text)"
              }}
            >
              {t('downloadPdf')}
            </button>
            <button
              onClick={handleNew}
              className="px-6 py-3 rounded-xl font-semibold shadow-md transition-transform hover:scale-105"
              style={{
                backgroundColor: "var(--button-bg)",
                color: "var(--button-text)"
              }}
            >
              {t('newProcess')}
            </button>
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
