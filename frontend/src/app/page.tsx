"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleUpload = () => {
    if (session) router.push("/upload");
    else signIn("google");
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-white p-6">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold mb-4">📄 PDF-AI</h1>
        <p className="text-gray-300 mb-8 leading-relaxed">
          PDF belgelerini yükle, yapay zeka ile özetle ve analiz et.  
          Hızlı, güvenli ve kolay bir deneyim seni bekliyor.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {!session ? (
            <button
              onClick={() => signIn("google")}
              className="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 transition"
            >
              Google ile Giriş Yap
            </button>
          ) : (
            <button
              onClick={() => signOut()}
              className="px-5 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition"
            >
              Çıkış Yap ({session.user?.name?.split(" ")[0]})
            </button>
          )}

          <button
            onClick={handleUpload}
            className="px-5 py-3 rounded-xl bg-green-500 hover:bg-green-600 transition"
          >
            PDF Yükleme Sayfası
          </button>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          {status === "loading"
            ? "Oturum bilgisi kontrol ediliyor..."
            : session
            ? `Giriş yapıldı: ${session.user?.email}`
            : "Henüz giriş yapmadın."}
        </p>
      </div>
    </main>
  );
}
