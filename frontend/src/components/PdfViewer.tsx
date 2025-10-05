"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// public/ klasörüne kopyaladığın .mjs dosyasını kullanıyoruz
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

type Props = {
  file: File | string;
  height?: number;
};

export default function PdfViewer({ file, height = 700 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  // Blob URL’ünü güvenli şekilde yönet
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // string URL ise direkt kullan
    if (typeof file === "string") {
      setObjectUrl(file);
      return () => {
        // string URL için revoke yok
      };
    }

    // File ise yeni URL üret
    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    // Bir önceki URL’i (varsa) temizle
    if (prevUrlRef.current && prevUrlRef.current !== url) {
      try {
        URL.revokeObjectURL(prevUrlRef.current);
      } catch {}
    }
    prevUrlRef.current = url;

    // Unmount’ta son URL’i temizle
    return () => {
      if (prevUrlRef.current) {
        try {
          URL.revokeObjectURL(prevUrlRef.current);
        } catch {}
        prevUrlRef.current = null;
      }
    };
  }, [file]); // dikkat: fileSource yok, sadece file

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  return (
    <div className="w-full">
      {/* Kontroller */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          className="px-3 py-1 rounded-xl bg-neutral-800 text-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ← Önceki
        </button>
        <button
          className="px-3 py-1 rounded-xl bg-neutral-800 text-white disabled:opacity-50"
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          disabled={!numPages || page >= numPages}
        >
          Sonraki →
        </button>

        <div className="ml-2 flex items-center gap-2">
          <span>Sayfa: {page}/{numPages || "?"}</span>
          <input
            type="number"
            className="w-20 px-2 py-1 rounded bg-neutral-800 text-white border border-neutral-700"
            min={1}
            max={numPages || 1}
            value={pageInput}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*$/.test(v)) setPageInput(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(pageInput, 10);
                if (!Number.isNaN(n)) {
                  const clamped = Math.min(Math.max(1, n), numPages || 1);
                  setPage(clamped);
                }
              }
            }}
            disabled={!numPages}
          />
          <button
            className="px-3 py-1 rounded-xl bg-neutral-800 text-white disabled:opacity-50"
            onClick={() => {
              const n = parseInt(pageInput, 10);
              if (!Number.isNaN(n)) {
                const clamped = Math.min(Math.max(1, n), numPages || 1);
                setPage(clamped);
              }
            }}
            disabled={!numPages}
          >
            Git
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-xl bg-neutral-800 text-white"
            onClick={() =>
              setScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(1))))
            }
          >
            −
          </button>
          <span>%{Math.round(scale * 100)}</span>
          <button
            className="px-3 py-1 rounded-xl bg-neutral-800 text-white"
            onClick={() =>
              setScale((s) => Math.min(2, Number((s + 0.1).toFixed(1))))
            }
          >
            +
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div
        className="rounded-2xl border border-neutral-700 bg-neutral-900 overflow-auto"
        style={{ height }}
      >
        {objectUrl ? (
          <Document
            file={objectUrl}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setPage(1);
              setPageInput("1");
            }}
            loading={<div className="p-6">Yükleniyor…</div>}
            error={<div className="p-6 text-red-400">PDF yüklenemedi.</div>}
          >
            <Page
              pageNumber={page}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        ) : (
          <div className="p-6">Dosya hazırlanıyor…</div>
        )}
      </div>
    </div>
  );
}
