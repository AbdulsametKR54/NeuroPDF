import { getSession } from "next-auth/react";

// Backend Adresi
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const sendRequest = async (
  endpoint: string,
  method: string = "GET",
  body: any = null,
  isFileUpload: boolean = false
) => {
  
  // 1. KRİTİK ADIM: Token'ı Session'dan (Cookie'den) Çek
  // getSession() fonksiyonu NextAuth cookie'sini çözer ve veriyi getirir.
  const session = await getSession();
  
  // route.ts dosyasında 'accessToken' olarak kaydetmiştik:
  const token = (session as any)?.accessToken; 
  
  // Misafir ID (Hala LocalStorage'da durur, bu doğru)
  const guestId = typeof window !== "undefined" ? localStorage.getItem("guest_id") : null;

  // 2. Headerları Hazırla
  const headers: Record<string, string> = {};

  // ✅ Token varsa ekle (Backend artık 'Misafir' demeyecek)
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Misafir ID varsa ekle
  if (guestId) {
    headers["X-Guest-ID"] = guestId;
  }

  // Dosya yüklemiyorsak JSON olduğunu belirt
  if (!isFileUpload && body) {
    headers["Content-Type"] = "application/json";
  }

  // 3. İsteği Gönder
  const config: RequestInit = {
    method: method,
    headers: headers,
  };

  if (body) {
    config.body = isFileUpload ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Hata: ${response.status}`);
    }

    // Yanıt tipine göre dön (JSON veya Dosya/Blob)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return await response.blob();
    }

  } catch (error) {
    console.error("API İsteği Hatası:", error);
    throw error;
  }
};