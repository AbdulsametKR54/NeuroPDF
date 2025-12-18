"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false); // Hydration hatasını önlemek için

  // 1. Başlangıç temasını yükle
  useEffect(() => {
    setMounted(true); // Bileşen tarayıcıda yüklendi
    const isDark =
      localStorage.getItem("theme") === "dark" ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDarkMode(isDark);
  }, []);

  // 2. Tema değişikliklerini uygula
  useEffect(() => {
    if (mounted) { // Sadece client tarafında çalışsın
      if (darkMode) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    }
  }, [darkMode, mounted]);

  // Sayfa yüklenene kadar boş div veya null döndür (Layout kaymasını önler)
  if (!mounted) return <div className="w-16 h-8 bg-gray-200 rounded-full" />;

  return (
    <div
      className={`relative w-16 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
        darkMode ? "bg-slate-700" : "bg-gray-200 border border-gray-300"
      }`}
      onClick={() => setDarkMode(!darkMode)}
    >
      {/* Güneş İkonu (Inline SVG - Dosya gerektirmez) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="absolute left-1.5 w-5 h-5 z-10 text-yellow-500 pointer-events-none"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>

      {/* Ay İkonu (Inline SVG - Dosya gerektirmez) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="absolute right-1.5 w-5 h-5 z-10 text-gray-400 pointer-events-none"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
      </svg>

      {/* Kayan Daire (Thumb) */}
      <motion.div
        className="w-6 h-6 bg-white rounded-full shadow-sm z-20"
        layout
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        animate={{ x: darkMode ? 32 : 0 }}
        style={{
             boxShadow: darkMode 
             ? "0px 2px 4px rgba(0,0,0,0.4)" 
             : "0px 2px 4px rgba(0,0,0,0.1)"
        }}
      />
    </div>
  );
}