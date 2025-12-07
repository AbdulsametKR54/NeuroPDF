import type { Metadata } from "next";
import "./globals.css";

import Providers from "./Providers"; // global providers (theme, session vs.)
import NavBar from "@/components/NavBar";
import ClientPdfPanel from "@/components/ClientPdfPanel";

import { PdfProvider } from "@/context/PdfContext";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: "PDF-AI",
  description: "Google ile giriş + FastAPI JWT akışı",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body
        className={
          "antialiased transition-colors duration-300 bg-[var(--background)] text-[var(--foreground)]"
        }
      >
        {/* Global Providers burada olmalı */}
        <Providers>
          {/* Dil yönetimi */}
          <LanguageProvider>
            {/* PDF yönetimi */}
            <PdfProvider>
              {/* Navbar */}
              <NavBar />

              {/* Content + Sağ Panel */}
              <div
                className="flex min-h-screen"
                style={{ paddingTop: "var(--navbar-height)" }} // Navbar yüksekliği dinamik
              >
                {/* SOL: Sayfa içeriği */}
                <main className="flex-1 flex flex-col min-w-0 px-4 md:px-6">
                  {children}
                </main>

                {/* SAĞ: PDF Panel - desktop'ta görünür, mobile’da gizli */}
                <div className="hidden lg:block">
                  <ClientPdfPanel />
                </div>
              </div>
            </PdfProvider>
          </LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
