"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AuthBar from "@/components/AuthBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle"; // ✅ YENİ BİLEŞEN EKLENDİ
import { useLanguage } from "@/context/LanguageContext";

export default function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  // const [darkMode, setDarkMode] = useState(false); // ❌ KALDIRILDI
  
  // ICONS
  const mergeIcon = "/icons/merge_icon.ico";
  const uploadIcon = "/icons/uploadingcloud.ico";
  const convertIcon = "/icons/convert_card_icon.ico";
  const extractIcon = "/icons/extract_icon.ico";
  const editIcon = "/icons/edit_icon.ico";

  const links = [
    { href: "/upload", label: t("navUpload"), icon: uploadIcon },
    { href: "/merge-pdf", label: t("navMerge"), icon: mergeIcon },
    { href: "/convert-pdf", label: t("navConvert"), icon: convertIcon },
    { href: "/extract-pdf", label: t("navExtract"), icon: extractIcon },
    { href: "/edit-pdf", label: t("navEdit"), icon: editIcon },
    { href: "/summarize-pdf", label: t("navSummarize"), icon: editIcon },
  ];

  // TEMA YÖNETİMİ KODLARI KALDIRILDI (ThemeToggle içine taşındı)
  /*
  useEffect(() => { ... }, []);
  useEffect(() => { ... }, [darkMode]);
  const toggleDarkMode = () => setDarkMode(!darkMode);
  */

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md transition-colors duration-300 border-b shadow-sm"
      style={{
        backgroundColor: "var(--background)",
        borderColor: "var(--navbar-border)",
      }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* --- SOL TARAF: LOGO --- */}
          <div className="flex-shrink-0 flex items-center">
            <Link
              href="/"
              className="font-extrabold text-xl sm:text-2xl tracking-tight hover:opacity-80 transition-opacity flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <img
                src="/icons/Neuro-PDF.ico"
                alt="NeuroPDF Logo"
                className="h-10 w-auto sm:h-12 object-contain"
              />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-orange-600">
                Neuro
              </span>
              <span className="hidden sm:inline">PDF</span>
            </Link>
          </div>

          {/* --- ORTA: DESKTOP MENU --- */}
          <nav className="hidden lg:flex items-center gap-4 text-sm">
            {links.map((l) => (
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
                {l.icon && (
                  <img
                    src={l.icon}
                    alt=""
                    className="w-4 h-4 opacity-90"
                    draggable={false}
                  />
                )}
                {l.label}
              </Link>
            ))}
          </nav>

          {/* --- SAĞ TARAF: DİL, TEMA, GİRİŞ --- */}
          <div className="flex items-center gap-3 sm:gap-4">
            
            <div className="hidden sm:flex items-center gap-3">
                <LanguageSwitcher />
                
                {/* ✅ ESKİ BUTON YERİNE YENİ TOGGLE GELDİ */}
                <ThemeToggle /> 

            </div>

            <div className="hidden sm:block">
                <AuthBar />
            </div>

            {/* --- HAMBURGER MENU BUTTON --- */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl hover:bg-[var(--container-bg)] transition-colors text-[var(--foreground)]"
            >
              {open ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
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
              {links.map((l) => (
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
                  {l.icon && <img src={l.icon} alt="" className="w-5 h-5 opacity-90" />}
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-col gap-3 pt-4 border-t border-[var(--navbar-border)]">
                <div className="flex justify-between items-center px-2">
                    <span className="text-sm font-semibold opacity-70">Ayarlar</span>
                    
                    {/* ✅ MOBİL MENÜDEKİ BUTON DA DEĞİŞTİ */}
                    <ThemeToggle />

                </div>
                <div className="flex gap-2">
                    <LanguageSwitcher />
                </div>
                <div className="pt-2">
                    <AuthBar />
                </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}