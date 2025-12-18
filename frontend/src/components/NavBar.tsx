"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import AuthBar from "@/components/AuthBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { useLanguage } from "@/context/LanguageContext";
import NeuroLogo from "@/components/NeuroLogo"; // ✅ Özel Logo Bileşeni

// ✅ EKSİK DOSYALAR YERİNE LUCIDE ICONLARI
import { 
  UploadCloud, 
  Merge, 
  FileType2, 
  Scissors, 
  FilePenLine, 
  FileText,
  Menu,
  X 
} from "lucide-react";

type NavLink = {
  href: string;
  label: string;
  Icon?: React.ElementType; // Lucide ikonları için tip güncellemesi
};

export default function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  // ✅ İkon eşleştirmeleri
  const links: NavLink[] = [
    { href: "/upload", label: t("navUpload"), Icon: UploadCloud },
    { href: "/merge-pdf", label: t("navMerge"), Icon: Merge },
    { href: "/convert-pdf", label: t("navConvert"), Icon: FileType2 },
    { href: "/extract-pdf", label: t("navExtract"), Icon: Scissors },
    { href: "/edit-pdf", label: t("navEdit"), Icon: FilePenLine },
    { href: "/summarize-pdf", label: t("navSummarize"), Icon: FileText },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md transition-colors duration-300 border-b shadow-sm"
      style={{ 
        borderColor: "var(--navbar-border)",
        backgroundColor: "rgba(var(--background-rgb), 0.8)" // Hafif transparanlık için
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
              {/* ✅ Logo Bileşeni Kullanımı
              <span className="inline-flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 shrink-0">
                <NeuroLogo className="h-full w-full" />
              </span> */}

              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-orange-600">
                Neuro
              </span>
              <span className="hidden sm:inline">PDF</span>
            </Link>
          </div>

          {/* --- ORTA: DESKTOP MENU --- */}
          <nav className="hidden lg:flex items-center gap-2 text-sm">
            {links.map((l) => {
              const Icon = l.Icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-2 rounded-lg font-medium transition-all duration-200 border border-transparent whitespace-nowrap flex items-center gap-2
                    ${
                      isActive(l.href)
                        ? "bg-[var(--button-bg)] text-[var(--button-text)] shadow-md"
                        : "text-[var(--foreground)] hover:bg-[var(--container-bg)] opacity-70 hover:opacity-100"
                    }`}
                >
                  {Icon && (
                    <Icon
                      className="w-4 h-4 opacity-90"
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
              {open ? (
                <X className="w-7 h-7" />
              ) : (
                <Menu className="w-7 h-7" />
              )}
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
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={`px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-3
                      ${
                        isActive(l.href)
                          ? "bg-[var(--button-bg)] text-[var(--button-text)] shadow-sm"
                          : "text-[var(--foreground)] hover:bg-[var(--container-bg)]"
                      }`}
                  >
                    {Icon && (
                      <Icon
                        className="w-5 h-5 opacity-90"
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