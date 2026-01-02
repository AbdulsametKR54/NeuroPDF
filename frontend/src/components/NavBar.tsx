"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import AuthBar from "@/components/AuthBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { useLanguage } from "@/context/LanguageContext";
// import NeuroLogo from "@/components/NeuroLogo"; // Logo bileşeni varsa açabilirsiniz

// ✅ Lucide iconları
import {
  UploadCloud,
  Merge,
  Scissors,
  FilePenLine,
  FileText,
  Crown,
  Menu,
  X,
} from "lucide-react";

type NavLink = {
  href: string;
  label: string;
  Icon?: React.ElementType;
  variant?: "default" | "pro";
};

export default function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  // ✅ İSTENEN NAVBAR SIRASI:
  // pdfpreview - extract - edit - merge - summarize - pro(taç)
  const links: NavLink[] = [
    // 1. PDF Preview (Upload)
    { href: "/upload", label: t("navUpload") || "Yükle", Icon: UploadCloud },

    // 2. Extract Pages
    { href: "/extract-pdf", label: t("navExtract") || "Ayıkla", Icon: Scissors },

    // 3. Edit Pages
    { href: "/edit-pdf", label: t("navEdit") || "Düzenle", Icon: FilePenLine },

    // 4. Merge PDFs
    { href: "/merge-pdf", label: t("navMerge") || "Birleştir", Icon: Merge },

    // 5. Summarize PDF
    { href: "/summarize-pdf", label: t("navSummarize") || "Özetle", Icon: FileText },

    // 6. PRO (Taç İkonlu)
    { 
      href: "/pricing", 
      label: "Pro", 
      Icon: Crown, 
      variant: "pro" 
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md transition-colors duration-300 border-b shadow-sm"
      style={{
        borderColor: "var(--navbar-border)",
        backgroundColor: "rgba(var(--background-rgb), 0.8)",
      }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* --- SOL: LOGO --- */}
          <div className="flex-shrink-0 flex items-center">
            <Link
              href="/"
              className="font-extrabold text-xl sm:text-2xl tracking-tight hover:opacity-80 transition-opacity flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-orange-600">
                Neuro
              </span>
              <span className="hidden sm:inline">PDF</span>
            </Link>
          </div>

          {/* --- ORTA: DESKTOP MENU --- */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-sm">
            {links.map((l) => {
              const Icon = l.Icon;
              const active = isActive(l.href);
              const isPro = l.variant === "pro";
              // ✅ Summarize linkini kontrol et
              const isSummarize = l.href === "/summarize-pdf";

              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={[
                    "px-3 py-2 rounded-lg font-medium transition-all duration-200 border border-transparent whitespace-nowrap flex items-center gap-2",
                    active
                      ? "bg-[var(--button-bg)] text-[var(--button-text)] shadow-md"
                      : "text-[var(--foreground)] hover:bg-[var(--container-bg)] opacity-70 hover:opacity-100",
                    isPro 
                      ? "bg-gradient-to-r from-yellow-400/20 to-orange-400/20 text-orange-600 dark:text-yellow-400 ring-1 ring-orange-400/50 hover:from-yellow-400/30 hover:to-orange-400/30 !opacity-100" 
                      : "",
                    isSummarize && !active
                      ? [
                          "!border-[var(--summarize-border-light)]",
                          "text-[var(--summarize-text-light)]",
                          "hover:bg-[var(--summarize-hover-bg-light)]",
                          "dark:!border-amber-400",
                          "dark:text-yellow-400",
                          "!opacity-100"
                        ].join(" ")
                      : ""
                  ].join(" ")}   // ✅ FIX
                >
                  {Icon && (
                    <Icon
                      className={[
                        "w-4 h-4",
                        active ? "opacity-100" : "opacity-70",
                        isPro ? "text-orange-500 dark:text-yellow-400 w-5 h-5" : "",
                        // ✅ Summarize ikonu rengi
                        isSummarize && !active ? "!opacity-100 text-yellow-600 dark:text-yellow-500" : ""
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  )}
                  {l.label}
                </Link>
              );
            })}
          </nav>

          {/* --- SAĞ: DİL / TEMA / AUTH --- */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-3">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>

            <div className="hidden sm:block">
              <AuthBar />
            </div>

            {/* --- HAMBURGER BUTTON --- */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl hover:bg-[var(--container-bg)] transition-colors text-[var(--foreground)]"
              aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
              type="button"
            >
              {open ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
            </button>
          </div>
        </div>

        {/* --- MOBILE MENU --- */}
        {open && (
          <div
            className="lg:hidden py-4 border-t space-y-4 animate-in slide-in-from-top-2 duration-200 bg-[var(--background)]"
            style={{ borderColor: "var(--navbar-border)" }}
          >
            <nav className="flex flex-col gap-2">
              {links.map((l) => {
                const Icon = l.Icon;
                const active = isActive(l.href);
                const isPro = l.variant === "pro";
                 // ✅ Summarize linkini kontrol et
                const isSummarize = l.href === "/summarize-pdf";

                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={[
                      // ✅ border sınıfı eklendi
                      "px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-3 border",
                      active
                        ? "bg-[var(--button-bg)] text-[var(--button-text)] shadow-sm border-transparent"
                        : "text-[var(--foreground)] hover:bg-[var(--container-bg)] border-transparent",
                      isPro 
                        ? "bg-gradient-to-r from-yellow-400/10 to-orange-400/10 text-orange-600 dark:text-yellow-400 !border-orange-200 dark:!border-yellow-900" 
                        : "",
                       // ✅ Summarize Altın Çerçeve (Mobil)
                      isSummarize && !active
                        ? "!border-yellow-500 dark:!border-amber-400 text-yellow-700 dark:text-yellow-400 bg-yellow-50/50 dark:bg-transparent"
                        : ""
                    ].join(" ")}
                  >
                    {Icon && (
                      <Icon
                        className={[
                          "w-5 h-5",
                          active ? "opacity-100" : "opacity-70",
                          isPro ? "text-orange-500 dark:text-yellow-400" : "",
                           // ✅ Summarize ikonu rengi (Mobil)
                          isSummarize && !active ? "!opacity-100 text-yellow-600 dark:text-yellow-500" : ""
                        ].join(" ")}
                        aria-hidden="true"
                      />
                    )}
                    {l.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-col gap-3 pt-4 border-t border-[var(--navbar-border)]">
              <div className="flex justify-between items-center px-2">
                <span className="text-sm font-semibold opacity-70">Ayarlar</span>
                <ThemeToggle />
              </div>

              <div className="flex gap-2 px-2">
                <LanguageSwitcher />
              </div>

              <div className="pt-2 px-2">
                <AuthBar />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}