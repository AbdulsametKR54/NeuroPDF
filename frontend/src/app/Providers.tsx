"use client";

import { SessionProvider } from "next-auth/react";
import { pdfjs } from "react-pdf";

// ------------------------------------------------------------------
// ✅ PDF Worker - Global Konfigürasyon
// ------------------------------------------------------------------
// Bu ayar, uygulamanın herhangi bir yerinde (Merge, Extract, Edit vb.)
// PDF.js kullanıldığında worker'ın otomatik yüklenmesini sağlar.
//
// CDN Kullanıyoruz çünkü:
// 1. Yerel dosyalarla uğraşmanıza gerek kalmaz (/public klasörüne dosya atmak vs.)
// 2. "pdfjs.version" değişkeni sayesinde her zaman kütüphanenizle
//    %100 uyumlu worker sürümü yüklenir. Çökme riskini sıfıra indirir.
// ------------------------------------------------------------------

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}