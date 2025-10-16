"use client";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="p-8 flex flex-col items-center gap-4">
      <h1 className="text-2xl font-semibold">Giriş Yap</h1>
      <button
        onClick={() => signIn("google")}
        className="px-4 py-2 rounded bg-black text-white"
      >
        Google ile Giriş
      </button>
      <p className="text-sm text-gray-500">
        Dev ortamı: Google consent screen “External (Testing)” ve seni Test User olarak ekledin.
      </p>
    </main>
  );
}
