// src/hooks/useGuestLimit.ts

import { useState, useCallback } from 'react';
import { guestService } from '@/services/guestService';

interface UsageInfo {
  can_use: boolean;
  usage_count: number;
  remaining_usage: number;
  message: string;
}

export function useGuestLimit() {
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Kullanım limitini kontrol et
   * İşlem yapmadan önce çağrılır
   */
  const checkLimit = useCallback(async (): Promise<boolean> => {
    // Giriş yapmış kullanıcılar için limit yok
    if (guestService.isLoggedIn()) {
      return true;
    }

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
      // Hata durumunda işleme izin ver
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

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