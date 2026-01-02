"use client";

import { useCallback, useState, useRef, useEffect } from "react";
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
import PdfChatPanel from "@/components/PdfChatPanel";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });
const MarkdownViewer = dynamic(() => import("@/components/MarkdownViewer"), { ssr: false });

// Helper: Hata Kodları için ENUM
type ErrorType = "NONE" | "INVALID_TYPE" | "SIZE_EXCEEDED" | "CUSTOM" | "UPLOAD_FIRST" | "PANEL_ERROR" | "SUMMARY_ERROR" | "AUDIO_ERROR" | "PDF_GEN_ERROR";

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
};

export default function SummarizePdfPage() {
  const { data: session, status } = useSession();
  const { pdfFile } = usePdf();
  
  // ✅ 1. Dil desteği için t() ve language alındı
  const { t, language } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  
  // ✅ 2. Hata state'i (Metin yerine Kod)
  const [errorType, setErrorType] = useState<ErrorType>("NONE");
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  // Chat State
  const [showChat, setShowChat] = useState(false);

  // Audio State
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false); 
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Limit Hesaplama
  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } = useGuestLimit();

  const clearError = () => {
    setErrorType("NONE");
    setCustomErrorMsg(null);
  };

  const resetAudio = () => {
    setAudioUrl(null);
    setAudioBlob(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const resetState = (f: File) => {
      setFile(f);
      setSummary("");
      clearError();
      resetAudio();
      setShowChat(false);
  };

  // --- DROPZONE AYARLARI ---
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    clearError();

    // Hata Kontrolü
    if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const errorObj = rejection.errors[0];

        if (errorObj.code === "file-invalid-type") {
            setErrorType("INVALID_TYPE");
        } else if (errorObj.code === "file-too-large") {
            setErrorType("SIZE_EXCEEDED");
        } else {
            setErrorType("CUSTOM");
            setCustomErrorMsg(errorObj.message);
        }
        setFile(null);
        return;
    }

    if (acceptedFiles?.length) {
      const f = acceptedFiles[0];
      
      if (f.type !== "application/pdf") {
          setFile(null);
          setErrorType("INVALID_TYPE");
          return;
      }

      if (f.size > maxBytes) {
        setFile(null);
        setErrorType("SIZE_EXCEEDED");
        return;
      }
      resetState(f);
    }
  }, [maxBytes]); // t bağımlılığına gerek yok

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
    maxSize: maxBytes,
  });

  const handleDropFromPanel = (e?: React.DragEvent<HTMLDivElement> | React.MouseEvent) => {
    clearError();
    if (pdfFile) {
        if (pdfFile.type !== "application/pdf") {
             setFile(null);
             setErrorType("INVALID_TYPE");
             return;
        }

      if (pdfFile.size > maxBytes) {
        setFile(null);
        setErrorType("SIZE_EXCEEDED");
        return;
      }
      resetState(pdfFile);
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
        e.preventDefault();
      }
    } else {
      setErrorType("PANEL_ERROR");
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
           setFile(null);
           setErrorType("INVALID_TYPE");
           e.target.value = '';
           return;
      }  

      if (f.size > maxBytes) {
        setFile(null);
        setErrorType("SIZE_EXCEEDED");
        e.target.value = '';
        return;
      }
      resetState(f);
    }
    e.target.value = '';
  };

  // --- ÖZETLEME İŞLEMİ ---
  const handleSummarize = async () => {
    if (!file) {
      setErrorType("UPLOAD_FIRST");
      return;
    }
    if (!session) {
      const canProceed = await checkLimit();
      if (!canProceed) return;
    }
    clearError();
    setSummarizing(true);
    resetAudio();

    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await sendRequest("/files/summarize", "POST", formData, true);

      if (data && data.summary) {
        setSummary(data.summary);
      } else {
        throw new Error("Özet alınamadı.");
      }

      if (!session) {
        try { await guestService.incrementUsage(); } catch (e) { console.error(e); }
      }
    } catch (e: any) {
      console.error("PDF Özetleme Hatası:", e);
      setErrorType("SUMMARY_ERROR"); // Genel özet hatası
    } finally {
      setSummarizing(false);
    }
  };

  // --- SESLENDİRME İŞLEMİ (TTS) ---
  const handleListen = async () => {
    if (!summary) return;
    if (audioUrl) { togglePlay(); return; }
    setAudioLoading(true);
    clearError();
    try {
        const resultBlob = await sendRequest("/files/listen-summary", "POST", { text: summary });
        if (!(resultBlob instanceof Blob)) throw new Error("Ses verisi alınamadı.");
        
        setAudioBlob(resultBlob);
        const objectUrl = window.URL.createObjectURL(resultBlob);
        setAudioUrl(objectUrl);
    } catch (e: any) {
        setErrorType("AUDIO_ERROR");
    } finally {
        setAudioLoading(false);
    }
  };

  // Ses İndirme
  const handleDownloadAudio = () => {
    if (!audioBlob) return;
    const url = window.URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "ozet-seslendirme.mp3";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // --- PDF İNDİRME ---
  const handleDownloadPdf = async () => {
    if (!summary) return;
    clearError();
    try {
      const blob = await sendRequest("/files/markdown-to-pdf", "POST", { markdown: summary });
      if (!(blob instanceof Blob)) throw new Error("PDF oluşturulamadı.");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "ozet-summary.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      setErrorType("PDF_GEN_ERROR");
    }
  };

  // --- Audio Kontrolleri ---
  const togglePlay = () => {
    if (audioRef.current) {
        if (isPlaying) audioRef.current.pause();
        else audioRef.current.play();
        setIsPlaying(!isPlaying);
    }
  };
  const handleTimeUpdate = () => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); };
  const handleLoadedMetadata = () => { if (audioRef.current) { setDuration(audioRef.current.duration); audioRef.current.play().then(()=>setIsPlaying(true)).catch(()=>setIsPlaying(false)); } };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { const time = parseFloat(e.target.value); if (audioRef.current) { audioRef.current.currentTime = time; setCurrentTime(time); } };
  const skipTime = (seconds: number) => { if (audioRef.current) audioRef.current.currentTime += seconds; };

  useEffect(() => {
    return () => { if (audioUrl) window.URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const handleNew = () => {
    setFile(null);
    setSummary("");
    resetAudio();
    clearError();
    setShowChat(false);
  };

  // ✅ Hata Mesajı Renderlayıcı
  const getErrorMessage = () => {
    if (customErrorMsg) return customErrorMsg;

    switch (errorType) {
        case "INVALID_TYPE": return t("invalidFileType");
        case "SIZE_EXCEEDED": return `${t("fileSizeExceeded")} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`;
        case "PANEL_ERROR": return t("panelPdfError");
        case "UPLOAD_FIRST": return t("uploadFirst");
        case "SUMMARY_ERROR": return t("summarizeFailed");
        case "AUDIO_ERROR": return "Seslendirme servisine ulaşılamadı."; // Bunu da dile ekleyebilirsiniz
        case "PDF_GEN_ERROR": return "PDF oluşturulurken hata meydana geldi.";
        default: return null;
    }
  };

  const currentError = getErrorMessage();

  

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)] relative">
      
      <audio 
        ref={audioRef} src={audioUrl || undefined} onTimeUpdate={handleTimeUpdate} 
        onLoadedMetadata={handleLoadedMetadata} onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} className="hidden" 
      />

      {/* --- YÜKLENİYOR OVERLAY --- */}
      {(summarizing || audioLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
            <div className="flex flex-col items-center justify-center p-8 rounded-2xl shadow-2xl border border-[var(--navbar-border)]"
                 style={{ backgroundColor: 'var(--container-bg)' }}>
                
                <div className="relative w-20 h-20">
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-[var(--navbar-border)] rounded-full opacity-30"></div>
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-t-[var(--button-bg)] rounded-full animate-spin"></div>
                </div>

                <h2 className="mt-6 text-2xl font-bold tracking-tight animate-pulse" style={{ color: 'var(--foreground)' }}>
                    {audioLoading ? (t('preparingAudio') || "Ses hazırlanıyor...") : (t('summarizingStatus') || "Yapay Zeka Özetliyor...")}
                </h2>
                
                <p className="mt-2 text-sm font-medium opacity-60 max-w-xs text-center" style={{ color: 'var(--foreground)' }}>
                    {audioLoading 
                        ? (t('waitAudioGen') || "Bu işlem biraz sürebilir...") 
                        : (t('waitMessage') || "PDF içeriği analiz ediliyor, lütfen bekleyin...")} 
                </p>
            </div>
        </div>
      )}

      <h1 className="text-3xl mb-6 tracking-tight">{t('summarizeTitle') || "PDF Özetleyici"}</h1>

      {/* Misafir Bilgilendirme */}
      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone Alanı */}
      <div
        {...getRootProps()}
        onDrop={handleDropFromPanel}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${isDragActive
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80"
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
          }`}
      >
        <input {...getInputProps()} accept="application/pdf" />
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
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
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
                disabled={summarizing}
                className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                {t('summarizeButton') || "Özetle"}
            </button>
        </div>
      )}

      {/* Özet Sonucu ve Aksiyonlar */}
      {summary && (
        <div className="mt-6 space-y-6">
          
          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl">
             <h3 className="text-xl mb-4 font-semibold border-b border-[var(--navbar-border)] pb-2">{t('summaryResultTitle') || "Özet Sonucu"}</h3>
             <MarkdownViewer markdown={summary} height={400} />
          </div>

          <div className="container-card p-6 border border-gray-300 dark:border-[var(--container-border)] shadow-xl space-y-4">
             <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('processSuccess') || "İşlem Başarılı"}
            </h3>

            {/* BUTON GRUBU */}
            <div className="flex gap-4 flex-wrap items-center mt-4 pb-2">
                
                <button 
                  onClick={handleDownloadPdf} 
                  className="btn-primary flex items-center gap-2 shadow-md hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5" />
                  </svg>
                  {t('downloadPdf') || "PDF Olarak İndir"}
                </button>

                {session ? (
                    <button onClick={handleListen} disabled={audioLoading} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:scale-105 ${
                        (audioUrl || audioLoading) ? "bg-[var(--button-bg)] text-white" : "bg-[var(--container-bg)] border border-[var(--navbar-border)] text-[var(--foreground)] hover:bg-[var(--button-bg)] hover:text-white"}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                        {audioLoading ? (t('loading') || "Hazırlanıyor...") : (t('listenSummary') || "Özeti Dinle")}
                    </button>
                ) : (
                    <div className="relative group">
                        <button disabled className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            {t('listenSummary') || "Özeti Dinle"}
                        </button>
                    </div>
                )}

                {/* SOHBET ET BUTONU */}
                {session && (
                  <button
                    onClick={() => setShowChat(!showChat)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:scale-105 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.159 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                    Sohbet Et
                  </button>
                )}
                
                <button 
                  onClick={handleNew} 
                  className="btn-primary flex items-center gap-2 shadow-md hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  {t('newProcess') || "Yeni İşlem"}
                </button>
            </div>

            {/* OYNATICI ALANI */}
            {audioUrl && (
                <div className="bg-[var(--background)] p-4 rounded-xl border border-[var(--navbar-border)] animate-in fade-in slide-in-from-top-4 duration-500 relative">
                    {/* Time Line */}
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-mono opacity-70 w-10 text-right">{formatTime(currentTime)}</span>
                        <input type="range" min="0" max={duration || 0} value={currentTime} onChange={handleSeek} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[var(--button-bg)]" />
                        <span className="text-xs font-mono opacity-70 w-10">{formatTime(duration)}</span>
                    </div>
                    {/* Kontroller */}
                    <div className="flex justify-center items-center gap-6">
                        <button onClick={() => skipTime(-10)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={togglePlay} className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--button-bg)] text-white hover:scale-110 transition shadow-lg">{isPlaying ? <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 ml-1"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>}</button>
                        <button onClick={() => skipTime(10)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></button>
                    </div>

                    {/* İNDİRME BUTONU */}
                    {session && audioBlob && (
                      <button 
                        onClick={handleDownloadAudio}
                        title={t('downloadAudio') || "Sesi İndir (MP3)"}
                        className="absolute bottom-4 right-4 text-gray-400 hover:text-[var(--button-bg)] hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full transition-all"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0 3-3m-3 3h7.5" />
                          </svg>
                      </button>
                    )}
                </div>
            )}
          </div>
        </div>
      )}

      {currentError && (
        <div className="error-box mt-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
            <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>{currentError}</span>
        </div>
      )}

      <UsageLimitModal isOpen={showLimitModal} onClose={closeLimitModal} onLogin={redirectToLogin} usageCount={usageInfo?.usage_count} maxUsage={3} />

      {file && (
        <PdfChatPanel file={file} isOpen={showChat} onClose={() => setShowChat(false)} />
      )}
    </main>
  );
}