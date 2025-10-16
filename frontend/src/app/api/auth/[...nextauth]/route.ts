import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: "select_account", scope: "openid email profile" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {
        const res = await fetch(`${process.env.BACKEND_API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_token: account.id_token }),
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          (token as any).apiToken = data.access_token;
          (token as any).userId = data.user_id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).apiToken = (token as any).apiToken ?? null;
      (session as any).userId = (token as any).userId ?? null;
      return session;
    },
  },
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
});

// ✅ v4.x App Router formatı:
export { handler as GET, handler as POST };
