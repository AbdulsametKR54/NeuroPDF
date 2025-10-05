"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import dynamic from "next/dynamic";

// SSR sorunlarını önlemek için dinamik import (SADECE bu olsun)
const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles?.length) setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiUrl}/files/upload`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || `Yükleme başarısız: ${res.status}`);
      }
    } catch (e: any) {
      setError(e?.message || "Bilinmeyen yükleme hatası");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold">
      <h1 className="text-3xl mb-6">PDF AI — Yükleme Demo</h1>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition
          ${isDragActive ? "bg-neutral-800" : "bg-neutral-900"}`}
      >
        <input {...getInputProps()} />
        {isDragActive ? <p>Dosyayı bırakın…</p> : <p>PDF’yi buraya sürükleyip bırakın veya tıklayıp seçin</p>}
      </div>

      <div className="mt-4">
        <input type="file" accept="application/pdf" onChange={handleSelect} />
      </div>

      {file && (
        <>
          <div className="mt-4 text-sm">
            Seçilen: <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
          </div>

          <div className="mt-6">
            <PdfViewer file={file} height={750} />
          </div>
        </>
      )}

      <button
        onClick={upload}
        disabled={!file || uploading}
        className="mt-6 px-4 py-2 rounded-xl bg-white text-black disabled:opacity-50"
      >
        {uploading ? "Yükleniyor..." : "Yükle"}
      </button>

      {error && (
        <div className="mt-4 p-3 rounded bg-red-100 text-red-700">{error}</div>
      )}
    </main>
  );
}
