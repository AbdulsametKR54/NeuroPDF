// ⚠️ Client-side kullanılacak
export const MAX_GUEST_MB = Number(
  process.env.NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB ?? 5
);

export const MAX_USER_MB = Number(
  process.env.NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB ?? 7
);

export const mbToBytes = (mb: number) =>
  Math.floor(mb * 1024 * 1024);

export const getMaxUploadBytes = (isGuest: boolean) =>
  mbToBytes(isGuest ? MAX_GUEST_MB : MAX_USER_MB);