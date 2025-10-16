// src/components/AuthBar.tsx
"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthBar() {
  const { data: session, status } = useSession();
  if (status === "loading") return <span>Kontrol ediliyor…</span>;

  return session?.user ? (
    <div className="flex items-center gap-3">
      <span>Merhaba, {session.user.name ?? "kullanıcı"}</span>
      <button onClick={() => signOut()} className="px-3 py-1 rounded bg-gray-200">
        Çıkış
      </button>
    </div>
  ) : (
    <button onClick={() => signIn("google")} className="px-3 py-1 rounded bg-black text-white">
      Google ile Giriş
    </button>
  );
}
