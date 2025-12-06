"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);
  const sunIcon = "/icons/sunny_icon.ico";
  const moonIcon = "/icons/moon_icon.ico";

  // Başlangıç temasını yükle
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDark =
        localStorage.getItem("theme") === "dark" ||
        (!("theme" in localStorage) &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      setDarkMode(isDark);
    }
  }, []);

  // Tema değişikliklerini uygula
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  return (
    <div
      className={`relative w-16 h-8 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
        darkMode ? "bg-slate-700" : "bg-gray-200 border border-gray-300"
      }`}
      onClick={() => setDarkMode(!darkMode)}
    >
      {/* Güneş İkonu */}
      <img
        src={sunIcon}
        alt="Light Mode"
        className="absolute left-1.5 w-5 h-5 z-10 pointer-events-none"
        draggable={false}
      />

      {/* Ay İkonu */}
      <img
        src={moonIcon}
        alt="Dark Mode"
        className="absolute right-1.5 w-5 h-5 z-10 pointer-events-none"
        draggable={false}
      />

      {/* Kayan Daire (Thumb) */}
      <motion.div
        className="w-6 h-6 bg-white rounded-full shadow-sm z-20"
        layout
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        animate={{ x: darkMode ? 32 : 0 }} // Kayan hareketin mesafesi
        style={{
            boxShadow: darkMode 
            ? "0px 2px 4px rgba(0,0,0,0.4)" 
            : "0px 2px 4px rgba(0,0,0,0.1)"
        }}
      />
    </div>
  );
}