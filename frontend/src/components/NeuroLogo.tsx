import React from "react";
import Image from "next/image";

interface NeuroLogoProps {
  className?: string;
  iconSize?: number; // İkon boyutu
  textSize?: string; // Yazı boyutu
}

export default function NeuroLogo({
  className = "",
  // ✅ Varsayılan boyutlar
  iconSize = 56, 
  textSize = "text-4xl", 
}: NeuroLogoProps) {
  return (
    <div className={`flex items-center gap-3 font-bold ${className}`}>
      {/* 1. SOL TARAFTA İKON */}
      <div className="relative flex-shrink-0">
        <Image 
          src="/logo/NeuroPDF-Chat.svg" 
          alt="Neuro PDF Logo" 
          width={iconSize} 
          height={iconSize} 
          className="object-contain"
          priority // Logonun hızlı yüklenmesi için
        />
      </div>

      {/* 2. SAĞ TARAFTA YAZI (Neuro + PDF) */}
      <div className={`flex items-center tracking-tight leading-none ${textSize}`}>
        
        {/* ✅ DÜZELTME: Rengi doğrudan global tema değişkeninden alıyoruz.
            Böylece globals.css'teki ayara göre otomatik Siyah (Light) / Beyaz (Dark) olur. 
        */}
        <span className="text-[var(--foreground)] transition-colors duration-300">
          Neuro
        </span>
        
        {/* PDF: Her zaman Kırmızı */}
        <span className="text-[#EF4444] ml-1">
          PDF
        </span>
      </div>
    </div>
  );
}