"use client";

import { usePdf } from "@/context/PdfContext";

export default function ClientPdfPanel() {
  const { pdfFile, savePdf, clearPdf } = usePdf();

  if (!pdfFile) return null;

  return (
    <aside 
      className="w-80 h-full flex flex-col border-l transition-colors duration-300"
      style={{ 
        backgroundColor: 'var(--background)',
        borderColor: 'var(--navbar-border)',
        color: 'var(--foreground)'
      }}
    >
      {/* Başlık Alanı */}
      <div 
        className="p-6 border-b"
        style={{ borderColor: 'var(--navbar-border)' }}
      >
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          📄 Aktif PDF
        </h2>
        <p className="text-xs opacity-60 mt-1">İşlem yapmak için dosyayı sürükleyin</p>
      </div>

      {/* İçerik Alanı */}
      <div className="p-6 flex-1 overflow-y-auto">
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copyMove";
            // Sürükleme başladığında opaklığı azaltabiliriz
            e.currentTarget.style.opacity = '0.5';
          }}
          onDragEnd={(e) => {
            e.currentTarget.style.opacity = '1';
            savePdf(pdfFile);
          }}
          className="group relative p-4 rounded-xl border shadow-sm cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:scale-[1.02] hover:border-blue-400 dark:hover:border-blue-500"
          style={{
            backgroundColor: 'var(--container-bg)',
            borderColor: 'var(--navbar-border)'
          }}
        >
          <div className="flex items-start gap-3">
            {/* PDF İkonu */}
            <div className="p-2.5 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            
            {/* Dosya Bilgileri */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate" title={pdfFile.name}>
                {pdfFile.name}
              </p>
              <p className="text-xs opacity-60 mt-1 font-mono">
                {(pdfFile.size / 1024).toFixed(1)} KB
              </p>
            </div>

            {/* Hızlı Sil Butonu (Hover'da görünür) */}
            <button 
                onClick={(e) => {
                    e.stopPropagation(); // Kartın sürüklenmesini engelleme
                    clearPdf();
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-100 text-red-500 transition-all"
                title="Dosyayı kaldır"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
               <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Kullanmak için sürükle
          </div>
        </div>
      </div>

      {/* Alt Aksiyon Alanı */}
      <div 
        className="p-4 border-t bg-opacity-50"
        style={{ borderColor: 'var(--navbar-border)', backgroundColor: 'var(--container-bg)' }}
      >
        <button 
          onClick={clearPdf} 
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 bg-red-600 hover:bg-red-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          Dosyayı Kaldır
        </button>
      </div>
    </aside>
  );
}