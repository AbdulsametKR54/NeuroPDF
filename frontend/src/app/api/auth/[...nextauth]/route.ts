import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: AuthOptions = {
  providers: [
    // 1. E-Posta/Şifre Girişi
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${process.env.BACKEND_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const data = await res.json();
          
          // Backend'den gelen veriyi NextAuth'a teslim et
          return {
            id: data.user_id,
            email: data.email,
            name: data.username,
            accessToken: data.access_token, // Backend'deki JWT
            eula_accepted: data.eula_accepted,
          } as any;
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),

    // 2. Google Girişi
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          scope: "openid email profile",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account, user, trigger, session }) {
      // A) İlk Giriş Anı (Credentials)
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.userId = user.id;
        token.eula_accepted = (user as any).eula_accepted;
      }

      // B) İlk Giriş Anı (Google)
      if (account?.id_token) {
        try {
          const res = await fetch(`${process.env.BACKEND_API_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: account.id_token }),
          });

          if (res.ok) {
            const data = await res.json();
            token.accessToken = data.access_token; // Backend JWT
            token.userId = data.user_id;
            token.eula_accepted = data.eula_accepted;
          }
        } catch (error) {
          console.error("Google Auth Error:", error);
        }
      }

      // C) Session Güncelleme (EULA onayı gibi durumlar için)
      if (trigger === "update" && session?.eula_accepted !== undefined) {
        token.eula_accepted = session.eula_accepted;
      }

      return token;
    },

    async session({ session, token }) {
      // Token'daki verileri Session'a aktar (Frontend görsün diye)
      (session as any).accessToken = token.accessToken;
      (session as any).userId = token.userId;
      
      if (session.user) {
        (session.user as any).eula_accepted = token.eula_accepted;
      }
      return session;
    },
  },

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/login", // Kendi login sayfanızın yolu
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };