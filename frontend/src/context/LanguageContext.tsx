"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '@/utils/translations';

// Context'in taşıyacağı verilerin tipleri
type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['tr']) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Varsayılan dil Türkçe
  const [language, setLanguage] = useState<Language>('tr');

  // Sayfa ilk yüklendiğinde tarayıcı hafızasına (localStorage) bak
  useEffect(() => {
    // Sadece tarayıcı ortamında çalışması için kontrol
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('app-language') as Language;
      // Eğer hafızada geçerli bir dil varsa onu kullan
      if (savedLang && (savedLang === 'tr' || savedLang === 'en')) {
        setLanguage(savedLang);
      }
    }
  }, []);

  // Dil değiştirme fonksiyonu
  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app-language', lang); // Seçimi kaydet
    }
  };

  // Çeviri fonksiyonu (t)
  // Örnek kullanım: t('loginButton') -> "Giriş Yap"
  const t = (key: keyof typeof translations['tr']) => {
    // Seçili dildeki karşılığı bul, yoksa anahtarı olduğu gibi göster
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Bileşenlerde kullanmak için kolay erişim kancası (hook)
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage, LanguageProvider içinde kullanılmalıdır!');
  }
  return context;
};