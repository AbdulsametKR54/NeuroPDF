// src/services/guestService.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface GuestSession {
  guest_id: string;
  usage_count: number;
  remaining_usage: number;
  max_usage: number;
}

interface UsageCheck {
  can_use: boolean;
  usage_count: number;
  remaining_usage: number;
  message: string;
}

class GuestService {
  private guestId: string | null = null;

  /**
   * LocalStorage'dan guest_id'yi al
   * Uygulama başlangıcında bir kez çağrılır
   */
  initializeGuestId(): void {
    if (typeof window === 'undefined') return;
    
    this.guestId = localStorage.getItem('guest_id');
    
    if (this.guestId) {
      console.log('✅ Existing guest session found:', this.guestId);
    }
  }

  /**
   * Sunucuda guest session oluştur
   */
  async createSession(): Promise<GuestSession> {
    try {
      const response = await fetch(`${API_BASE_URL}/guest/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create guest session');
      }

      const data: GuestSession = await response.json();
      this.guestId = data.guest_id;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('guest_id', this.guestId);
      }
      
      console.log('✅ New guest session created:', this.guestId);
      return data;
    } catch (error) {
      console.error('❌ Error creating guest session:', error);
      throw error;
    }
  }

  /**
   * Guest ID'yi al, yoksa oluştur
   */
  async getGuestId(): Promise<string> {
    if (!this.guestId) {
      await this.createSession();
    }
    return this.guestId!;
  }

  /**
   * Kullanım durumunu kontrol et
   * İşlem yapmadan önce çağrılır
   */
  async checkUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();
      
      const response = await fetch(`${API_BASE_URL}/guest/check-usage`, {
        headers: {
          'X-Guest-ID': guestId
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check usage');
      }

      return await response.json();
    } catch (error) {
      console.error('❌ Error checking guest usage:', error);
      throw error;
    }
  }

  /**
   * Kullanım sayısını artır
   * PDF download edildikten sonra çağrılır
   */
  async incrementUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();
      
      const response = await fetch(`${API_BASE_URL}/guest/use`, {
        method: 'POST',
        headers: {
          'X-Guest-ID': guestId
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Usage limit reached');
      }

      const result = await response.json();
      console.log('📊 Guest usage updated:', result);
      return result;
    } catch (error) {
      console.error('❌ Error incrementing usage:', error);
      throw error;
    }
  }

  /**
   * Guest session'ı temizle
   * Kullanıcı giriş yaptığında çağrılır
   */
  async clearSession(): Promise<void> {
    try {
      if (!this.guestId) return;

      await fetch(`${API_BASE_URL}/guest/session`, {
        method: 'DELETE',
        headers: {
          'X-Guest-ID': this.guestId
        }
      });

      if (typeof window !== 'undefined') {
        localStorage.removeItem('guest_id');
      }
      
      this.guestId = null;
      console.log('✅ Guest session cleared');
    } catch (error) {
      console.error('❌ Error clearing guest session:', error);
    }
  }

  /**
   * ✅ GÜNCELLEME: NextAuth session kontrolü
   * Kullanıcı giriş yapmış mı kontrol et
   * NOT: Bu fonksiyon artık client-side'da useSession hook'u ile kullanılmalı
   */
  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;
    
    // NextAuth session bilgisini kontrol et
    // Bu bilgi client component'lerde useSession() ile alınmalı
    // Bu fonksiyon artık deprecated - useSession kullanın
    console.warn('⚠️ guestService.isLoggedIn() deprecated. Use useSession() from next-auth/react instead.');
    
    return false; // Her zaman false döndür, çünkü session bilgisi hook ile alınmalı
  }

  /**
   * Mevcut guest ID'yi al (varsa)
   */
  getCurrentGuestId(): string | null {
    return this.guestId;
  }
}

// Singleton instance
export const guestService = new GuestService();