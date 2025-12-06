"use client";

import { useState } from "react";
import { pdfService } from "@/services/pdfService";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  markdown: string;
  defaultPdfName?: string;
  height?: number | string;
};

export default function MarkdownViewer({
  markdown,
  defaultPdfName = "summary.pdf",
  height,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setError(null);
    try {
      setLoading(true);
      // PDF oluştur ve indir
      await pdfService.createPdfFromMarkdown(markdown, defaultPdfName);
    } catch (err: any) {
      console.error("❌ PDF oluşturulamadı:", err);
      setError("PDF oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (!markdown) {
    return (
      <div className="w-full p-6 text-center text-gray-500 dark:text-gray-400">
        Özet henüz hazır değil.
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 font-sans text-[var(--foreground)]">
      {/* Markdown Render */}
      <div
        className="prose max-w-full p-4 rounded-xl border overflow-auto"
        style={{
          height: height || "auto",
          backgroundColor: "var(--background)",
          borderColor: "var(--navbar-border)",
          color: "var(--foreground)",
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
