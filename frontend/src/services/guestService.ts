// src/services/guestService.ts
// ✅ DÜZELTME: createSession metodu POST olmalı

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
   * ✅ DÜZELTME: Sunucuda guest session oluştur
   */
  async createSession(): Promise<GuestSession> {
    try {
      console.log('🔄 Creating new guest session...');
      
      const response = await fetch(`${API_BASE_URL}/guest/session`, {
        method: 'POST',  // ✅ POST olmalı!
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Session creation failed:', response.status, errorText);
        throw new Error('Failed to create guest session');
      }

      const data: GuestSession = await response.json();
      this.guestId = data.guest_id;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('guest_id', this.guestId);
      }
      
      console.log('✅ New guest session created:', this.guestId);
      console.log('📊 Initial usage:', data);
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
      console.log('⚠️ No guest ID found, creating new session...');
      await this.createSession();
    }
    return this.guestId!;
  }

  /**
   * ✅ DÜZELTME: Kullanım durumunu kontrol et
   */
  async checkUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();
      
      console.log('🔍 Checking usage for guest:', guestId);
      
      const response = await fetch(`${API_BASE_URL}/guest/check-usage`, {
        method: 'GET',  // ✅ GET doğru
        headers: {
          'X-Guest-ID': guestId
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Usage check failed:', response.status, errorText);
        throw new Error('Failed to check usage');
      }

      const result = await response.json();
      console.log('✅ Usage check result:', result);
      return result;
    } catch (error) {
      console.error('❌ Error checking guest usage:', error);
      throw error;
    }
  }

  /**
   * ✅ DÜZELTME: Kullanım sayısını artır
   */
  async incrementUsage(): Promise<UsageCheck> {
    try {
      const guestId = await this.getGuestId();
      
      console.log('➕ Incrementing usage for guest:', guestId);
      
      const response = await fetch(`${API_BASE_URL}/guest/use`, {
        method: 'POST',  // ✅ POST doğru
        headers: {
          'X-Guest-ID': guestId,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Increment failed:', error);
        throw new Error(error.detail || 'Usage limit reached');
      }

      const result = await response.json();
      console.log('✅ Usage incremented:', result);
      console.log(`📊 Status: ${result.usage_count}/${result.usage_count + result.remaining_usage} used`);
      return result;
    } catch (error) {
      console.error('❌ Error incrementing usage:', error);
      throw error;
    }
  }

  /**
   * Guest session'ı temizle
   */
  async clearSession(): Promise<void> {
    try {
      if (!this.guestId) return;

      console.log('🗑️ Clearing guest session:', this.guestId);

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
   */
  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;
    
    // NextAuth session bilgisini kontrol et
    // Bu bilgi client component'lerde useSession() ile alınmalı
    console.warn('⚠️ guestService.isLoggedIn() deprecated. Use useSession() from next-auth/react instead.');
    
    return false;
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