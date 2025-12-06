"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const STORAGE_KEY = "activePdfBase64";

interface PdfContextType {
  pdfFile: File | null;
  savePdf: (file: File) => Promise<void>;
  clearPdf: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const byteString = atob(stored.split(",")[1]);
      const array = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) array[i] = byteString.charCodeAt(i);
      const blob = new Blob([array], { type: "application/pdf" });
      setPdfFile(new File([blob], "newPDF.pdf", { type: "application/pdf" }));
    }
  }, []);

  const savePdf = (file: File) => {
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        sessionStorage.setItem(STORAGE_KEY, reader.result as string);
        setPdfFile(file);
        setRefreshKey((prev) => prev + 1); // Sağ paneli refresh et
        resolve();
      };
      reader.readAsDataURL(file);
    });
  };

  const clearPdf = () => {
    setPdfFile(null);
    sessionStorage.removeItem(STORAGE_KEY);
    setRefreshKey((prev) => prev + 1); // Sağ paneli refresh et
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
