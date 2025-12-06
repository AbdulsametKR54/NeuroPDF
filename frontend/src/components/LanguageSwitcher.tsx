"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Menü açıkken dışarı tıklanırsa kapatma mantığı
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (lang: 'tr' | 'en') => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      
      {/* --- ANA BUTON (TRIGGER) --- */}
      {/* DÜZELTME: Buraya 'btn-primary' ekledik. 
          Böylece Navbar'daki TR butonu Kırmızı zemin üzerine BEYAZ yazı olur. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-primary flex items-center gap-2 min-w-[80px] justify-between"
      >
        {/* Seçili Dil */}
        <span className="text-sm font-bold w-5 text-center">{language.toUpperCase()}</span>
        
        {/* Aşağı Ok İkonu */}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 20 20" 
          fill="currentColor" 
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* --- AÇILIR MENÜ (DROPDOWN) --- */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-32 rounded-xl shadow-xl border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
          style={{ 
            backgroundColor: 'var(--background)', 
            borderColor: 'var(--navbar-border)' 
          }}
        >
          <div className="p-1 flex flex-col gap-0.5">
            
            {/* TÜRKÇE SEÇENEĞİ */}
            <button
              onClick={() => handleSelect('tr')}
              // DÜZELTME: Seçiliyse .btn-primary kullan (Beyaz yazı için)
              className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'tr' 
                  ? 'btn-primary shadow-none' // Seçiliyse Kırmızı/Beyaz
                  : 'text-[var(--foreground)] hover:bg-[var(--container-bg)]'
              }`}
            >
              <span>Türkçe</span>
              {language === 'tr' && <span>✓</span>}
            </button>
            
            {/* İNGİLİZCE SEÇENEĞİ */}
            <button
              onClick={() => handleSelect('en')}
              // DÜZELTME: Seçiliyse .btn-primary kullan
              className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                language === 'en' 
                  ? 'btn-primary shadow-none' // Seçiliyse Kırmızı/Beyaz
                  : 'text-[var(--foreground)] hover:bg-[var(--container-bg)]'
              }`}
            >
              <span>English</span>
              {language === 'en' && <span>✓</span>}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}