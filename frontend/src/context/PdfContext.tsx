"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const STORAGE_KEY = "activePdfBase64";

interface PdfContextType {
  pdfFile: File | null;
  savePdf: (file: File | null) => Promise<void>; // null kabul edecek şekilde güncelledik
  clearPdf: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Sayfa yenilendiğinde SessionStorage'dan PDF'i kurtar
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const byteString = atob(stored.split(",")[1]);
        const array = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) array[i] = byteString.charCodeAt(i);
        const blob = new Blob([array], { type: "application/pdf" });
        setPdfFile(new File([blob], "restored_document.pdf", { type: "application/pdf" }));
      }
    } catch (e) {
      console.error("PDF kurtarma hatası:", e);
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const savePdf = (file: File | null) => {
    return new Promise<void>((resolve) => {
      
      // ✅ DÜZELTME 1: Dosya 'null' ise sessizce çık (Hata basma)
      if (!file) {
        setPdfFile(null); // State'i de temizle
        sessionStorage.removeItem(STORAGE_KEY); // Storage'ı da temizle
        resolve();
        return;
      }

      // ✅ DÜZELTME 2: Dosya var ama formatı bozuksa (Blob değilse) HATA BAS
      // file.slice kontrolü en güvenilir Blob/File kontrolüdür
      if (typeof file.slice !== 'function') {
        console.error("⛔ GÜVENLİK: savePdf'e geçersiz veri gönderildi.", file);
        resolve(); 
        return;
      }

      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const base64String = reader.result as string;
          sessionStorage.setItem(STORAGE_KEY, base64String);
        } catch (storageError) {
          console.warn("⚠️ PDF çok büyük, sessionStorage'a kaydedilemedi.");
        }
        
        setPdfFile(file);
        setRefreshKey((prev) => prev + 1);
        resolve();
      };

      reader.onerror = (err) => {
        console.error("Dosya okuma hatası:", err);
        resolve();
      };

      try {
        reader.readAsDataURL(file);
      } catch (e) {
        console.error("readAsDataURL hatası:", e);
        resolve();
      }
    });
  };

  const clearPdf = () => {
    setPdfFile(null);
    sessionStorage.removeItem(STORAGE_KEY);
    setRefreshKey((prev) => prev + 1);
  };

  const triggerRefresh = () => setRefreshKey((prev) => prev + 1);

  return (
    <PdfContext.Provider value={{ pdfFile, savePdf, clearPdf, refreshKey, triggerRefresh }}>
      {children}
    </PdfContext.Provider>
  );
}

export function usePdf() {
  const context = useContext(PdfContext);
  if (!context) throw new Error("usePdf must be used within a PdfProvider");
  return context;
}