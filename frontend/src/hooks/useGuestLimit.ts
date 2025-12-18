// src/hooks/useGuestLimit.ts

import { useState, useCallback } from 'react';
import { useSession } from "next-auth/react"; // ✅ EKLENDİ
import { guestService } from '@/services/guestService';

interface UsageInfo {
  can_use: boolean;
  usage_count: number;
  remaining_usage: number;
  message: string;
}

export function useGuestLimit() {
  // ✅ NextAuth session durumunu buradan dinliyoruz
  const { data: session, status } = useSession(); 
  
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Kullanım limitini kontrol et
   * İşlem yapmadan önce çağrılır
   */
  const checkLimit = useCallback(async (): Promise<boolean> => {
    // 1. Durum: Session henüz yükleniyor (Loading)
    // Beklemesi lazım, ama UI donmasın diye false dönüp işlemi durdurabiliriz 
    // veya loading state'i yönetebiliriz. Şimdilik güvenli olan false dönmek.
    if (status === "loading") {
      return false; 
    }

    // 2. Durum: Kullanıcı KESİN OLARAK giriş yapmış (Authenticated)
    // guestService'e hiç gitme, direkt izin ver.
    if (status === "authenticated" || session) {
      return true;
    }

    // 3. Durum: Kullanıcı giriş yapmamış, Guest kontrolü yap (Unauthenticated)
    setLoading(true);
    try {
      const result = await guestService.checkUsage();
      setUsageInfo(result);

      if (!result.can_use) {
        setShowLimitModal(true);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking guest limit:', error);
      // Hata durumunda (API çökükse vs.) kullanıcıyı engellemek yerine izin vermek
      // daha iyi bir UX olabilir, veya false dönüp hata gösterebilirsin.
      return true; 
    } finally {
      setLoading(false);
    }
  }, [session, status]); // ✅ Bağımlılıklara session ve status eklendi

  /**
   * Modal'ı kapat
   */
  const closeLimitModal = useCallback(() => {
    setShowLimitModal(false);
  }, []);

  /**
   * Login sayfasına yönlendir
   */
  const redirectToLogin = useCallback(() => {
    // Next.js router kullanmak daha iyidir ama window da çalışır
    window.location.href = '/login';
  }, []);

  return {
    usageInfo,
    showLimitModal,
    loading,
    checkLimit,
    closeLimitModal,
    redirectToLogin
  };
}