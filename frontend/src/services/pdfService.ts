// src/services/pdfService.ts

import { guestService } from './guestService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface UploadResponse {
  filename: string;
  size_kb: number;
  temp_id: string;
}

class PDFService {
  private getAuthHeaders(apiToken?: string | null): HeadersInit {
    const headers: HeadersInit = {};
    if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;
    return headers;
  }

  private async getGuestHeaders(isLoggedIn: boolean): Promise<HeadersInit> {
    const headers: HeadersInit = {};
    if (!isLoggedIn) {
      const guestId = await guestService.getGuestId();
      headers['X-Guest-ID'] = guestId;
    }
    return headers;
  }

  /**
   * Dosya indirme helper
   */
  public downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Markdown'dan PDF oluştur ve indir (Blob tabanlı)
   */
  async createPdfFromMarkdown(markdown: string, filename = "output.pdf"): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/files/markdown-to-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: markdown, // ❗ RAW STRING
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `PDF generation failed: ${response.status}`);
    }

    const blob = await response.blob();
    this.downloadFile(blob, filename);
  }


  /**
   * PDF Upload (geçici)
   */
  async upload(file: File, apiToken?: string | null): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(!!apiToken);

    const response = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * PDF'i text'e çevir ve indir (guest kullanım sayısı artırılır)
   */
  async convertToText(file: File, apiToken?: string | null): Promise<void> {
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${API_BASE_URL}/files/convert-text`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Conversion failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = file.name.replace(/\.pdf$/i, '.txt');

    this.downloadFile(blob, filename);

    if (!isLoggedIn) {
      try { await guestService.incrementUsage(); } 
      catch (error) { console.error('❌ Could not increment guest usage:', error); }
    }
  }

  /**
   * PDF sayfalarını ayır
   */
  async extractPages(file: File, pageRange: string, apiToken?: string | null): Promise<void> {
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('page_range', pageRange);

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${API_BASE_URL}/files/extract-pages`, {
      method: 'POST',
      headers: { ...authHeaders, ...guestHeaders },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Extraction failed: ${response.status}`);
    }

    const blob = await response.blob();
    const safePageRange = pageRange.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = file.name.replace('.pdf', `_pages_${safePageRange}.pdf`);
    
    this.downloadFile(blob, filename);

    if (!isLoggedIn) {
      try { await guestService.incrementUsage(); } 
      catch (error) { console.error('❌ Could not increment guest usage:', error); }
    }
  }

  /**
   * PDF birleştir
   */
  async mergePDFs(files: File[], apiToken?: string | null): Promise<void> {
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${API_BASE_URL}/files/merge-pdfs`, {
      method: 'POST',
      headers: { ...authHeaders, ...guestHeaders },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Merge failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = 'merged.pdf';

    this.downloadFile(blob, filename);

    if (!isLoggedIn) {
      try { await guestService.incrementUsage(); } 
      catch (error) { console.error('❌ Could not increment guest usage:', error); }
    }
  }

  /**
   * İşlenmiş PDF'i kaydet (login user)
   */
  async saveProcessed(blob: Blob, filename: string, apiToken?: string | null): Promise<any> {
    if (!apiToken) throw new Error('You must be logged in to save files');

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('filename', filename);

    const authHeaders = this.getAuthHeaders(apiToken);

    const response = await fetch(`${API_BASE_URL}/files/save-processed`, {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Save failed: ${response.status}`);
    }

    return await response.json();
  }
}

export const pdfService = new PDFService();
