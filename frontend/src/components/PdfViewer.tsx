"use client";

import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useLanguage } from "@/context/LanguageContext";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Worker ayarı
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

type Props = {
  file: File | string;
  height?: number;
};

export default function PdfViewer({ file, height = 700 }: Props) {
  const { t } = useLanguage();
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  // Sayfa inputunu güncelle
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  // Yeni dosya geldiğinde sayfayı başa al
  useEffect(() => {
    setPage(1);
    setPageInput("1");
  }, [file]);

  const changePage = (newPage: number) => {
    const clamped = Math.min(Math.max(1, newPage), numPages || 1);
    setPage(clamped);
  };

  const buttonClass = "px-3 py-1.5 rounded-lg text-sm font-bold shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed";
  
  const buttonStyle = {
    backgroundColor: 'var(--button-bg)',
    color: 'var(--button-text)',
    border: 'none'
  };

  return (
    <div className="w-full flex flex-col gap-3">
      
      {/* --- TOOLBAR --- */}
      <div 
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border shadow-sm"
        style={{ 
            backgroundColor: 'var(--container-bg)', 
            borderColor: 'var(--container-border)' 
        }}
      >
        {/* Sol: Sayfa Gezinti */}
        <div className="flex items-center gap-2">
          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={() => changePage(page - 1)}
            disabled={page <= 1}
          >
            ← {t('prev')}
          </button>
          
          <div className="flex items-center gap-1">
            <input
              type="text"
              className="w-12 px-1 py-1.5 text-center rounded-lg border text-sm font-medium focus:outline-none focus:ring-2"
              style={{ 
                  backgroundColor: 'var(--background)', 
                  color: 'var(--foreground)',
                  borderColor: 'var(--navbar-border)',
                  '--tw-ring-color': 'var(--button-bg)'
              } as React.CSSProperties}
              value={pageInput}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d*$/.test(v)) setPageInput(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") changePage(parseInt(pageInput, 10));
              }}
              disabled={!numPages}
            />
            <span className="text-sm opacity-70" style={{ color: 'var(--foreground)' }}>/ {numPages || "--"}</span>
          </div>

          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={() => changePage(page + 1)}
            disabled={!numPages || page >= numPages}
          >
            {t('next')} →
          </button>
        </div>

        {/* Sağ: Zoom Kontrolü */}
        <div className="flex items-center gap-2">
          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(1))))}
          >
            −
          </button>
          <span className="text-sm font-medium w-12 text-center" style={{ color: 'var(--foreground)' }}>
            %{Math.round(scale * 100)}
          </span>
          <button
            className={buttonClass}
            style={buttonStyle}
            onClick={() => setScale((s) => Math.min(3, Number((s + 0.1).toFixed(1))))}
          >
            +
          </button>
        </div>
      </div>

      {/* --- PDF GÖRÜNTÜLEME ALANI --- */}
      <div
        className="rounded-xl border overflow-auto flex justify-center bg-gray-100 dark:bg-gray-900"
        style={{ 
            height,
            borderColor: 'var(--container-border)' 
        }}
      >
        {/* DÜZELTME:
            - createObjectURL kaldırıldı.
            - ArrayBuffer kaldırıldı.
            - `file` prop'u doğrudan Document bileşenine verildi.
            - react-pdf dosya türünü (String URL veya File objesi) kendi algılayıp yönetir.
        */}
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
          }}
          loading={
              <div className="flex items-center justify-center h-full text-sm opacity-70" style={{ color: 'var(--foreground)' }}>
                  {t('loading')}
              </div>
          }
          error={
              <div className="flex items-center justify-center h-full text-red-500 font-medium">
                  {t('pdfLoadError')}
              </div>
          }
          className="flex justify-center py-8"
        >
          <Page
            pageNumber={page}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  );
}