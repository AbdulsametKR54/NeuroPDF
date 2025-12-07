// src/services/pdfService.ts

import { guestService } from './guestService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface UploadResponse {
  filename: string;
  size_kb: number;
  temp_id: string;
}

class PDFService {
  /**
   * ✅ GÜNCELLEME: NextAuth token'ı kullan
   * Authorization header'ı hazırla
   * @param session - NextAuth session objesi (useSession'dan gelen)
   */
  private getAuthHeaders(apiToken?: string | null): HeadersInit {
    const headers: HeadersInit = {};
    
    if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
      console.log('✅ Using NextAuth token for request');
    }
    
    return headers;
  }

  /**
   * Guest ID header'ı ekle (giriş yapılmamışsa)
   */
  private async getGuestHeaders(isLoggedIn: boolean): Promise<HeadersInit> {
    const headers: HeadersInit = {};
    
    if (!isLoggedIn) {
      const guestId = await guestService.getGuestId();
      headers['X-Guest-ID'] = guestId;
      console.log('✅ Using guest ID for request:', guestId);
    }
    
    return headers;
  }

  /**
   * Dosyayı indirmek için yardımcı fonksiyon
   */
  private downloadFile(blob: Blob, filename: string): void {
    console.log('📥 Downloading file:', filename, 'Size:', blob.size, 'bytes');
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    
    document.body.appendChild(a);
    console.log('🔗 Download link created, clicking...');
    a.click();
    
    // Cleanup
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      console.log('✅ Download triggered, cleanup done');
    }, 100);
  }

  /**
   * PDF Upload (geçici olarak)
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
        ...guestHeaders
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * PDF to Text Conversion
   * Download sonrası guest usage artır
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
        ...guestHeaders
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Conversion failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = file.name.replace(/\.pdf$/i, '.txt');
    
    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        const result = await guestService.incrementUsage();
        console.log('✅ Guest usage incremented:', result);
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    } else {
      console.log('ℹ️ Logged in user - guest usage not tracked');
    }
  }

  /**
   * Extract Pages
   * Download sonrası guest usage artır
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
      headers: {
        ...authHeaders,
        ...guestHeaders
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Extraction failed: ${response.status}`);
    }

    const blob = await response.blob();
    const safePageRange = pageRange.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = file.name.replace('.pdf', `_pages_${safePageRange}.pdf`);
    
    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        const result = await guestService.incrementUsage();
        console.log('✅ Guest usage incremented:', result);
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    } else {
      console.log('ℹ️ Logged in user - guest usage not tracked');
    }
  }

  /**
   * Merge PDFs
   * Download sonrası guest usage artır
   */
  async mergePDFs(files: File[], apiToken?: string | null): Promise<void> {
    const isLoggedIn = !!apiToken;
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const authHeaders = this.getAuthHeaders(apiToken);
    const guestHeaders = await this.getGuestHeaders(isLoggedIn);

    const response = await fetch(`${API_BASE_URL}/files/merge-pdfs`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        ...guestHeaders
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Merge failed: ${response.status}`);
    }

    const blob = await response.blob();
    const filename = 'merged.pdf';
    
    // Dosyayı indir
    this.downloadFile(blob, filename);

    // Guest kullanıcı ise usage artır
    if (!isLoggedIn) {
      try {
        const result = await guestService.incrementUsage();
        console.log('✅ Guest usage incremented:', result);
      } catch (error) {
        console.error('❌ Could not increment guest usage:', error);
      }
    } else {
      console.log('ℹ️ Logged in user - guest usage not tracked');
    }
  }

  /**
   * ✅ GÜNCELLEME: Save Processed PDF
   * İşlenmiş PDF'i kullanıcının hesabına kaydet (sadece login user)
   * @param blob - PDF blob
   * @param filename - Dosya adı
   * @param apiToken - NextAuth session'dan gelen token
   */
  async saveProcessed(blob: Blob, filename: string, apiToken?: string | null): Promise<any> {
    if (!apiToken) {
      throw new Error('You must be logged in to save files');
    }

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('filename', filename);

    const authHeaders = this.getAuthHeaders(apiToken);

    console.log('💾 Saving processed PDF with auth token...');

    const response = await fetch(`${API_BASE_URL}/files/save-processed`, {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || `Save failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ PDF saved successfully:', result);
    return result;
  }
}

// Singleton instance
export const pdfService = new PDFService();