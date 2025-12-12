// app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const handler = NextAuth({
  providers: [
    // ✅ Credentials Provider (Login page için)
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.error('❌ Credentials missing');
          return null;
        }

        try {
          // Backend Login İsteği
          const res = await fetch(`${process.env.BACKEND_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Login failed:', errorText);
            return null;
          }

          const data = await res.json();
          console.log('✅ Login success:', data.user_id);
          
          // Backend'den gelen veriyi NextAuth User formatına çevir
          return {
            id: data.user_id,
            email: data.email,
            name: data.username,
            // DÜZELTME: Standart olması için 'accessToken' ismini kullanıyoruz
            accessToken: data.access_token, 
            eula_accepted: data.eula_accepted,
          } as any;
        } catch (error) {
          console.error('💥 Authorize error:', error);
          return null;
        }
      },
    }),
    
    // ✅ Google Provider
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { 
        params: { 
          prompt: "select_account", 
          scope: "openid email profile" 
        } 
      },
    }),
  ],
  
  callbacks: {
    async jwt({ token, account, user, trigger, session }) {
      
      // 1. Credentials login - user objesi ilk login'de gelir
      if (user) {
        // DÜZELTME: apiToken yerine accessToken
        (token as any).accessToken = (user as any).accessToken || (user as any).apiToken;
        (token as any).userId = user.id;
        (token as any).eula_accepted = (user as any).eula_accepted;
      }
      
      // 2. Google login - account.id_token var ise Backend'e git
      if (account?.id_token) {
        try {
          const res = await fetch(`${process.env.BACKEND_API_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: account.id_token }),
            cache: "no-store",
          });
          
          if (res.ok) {
            const data = await res.json();
            // DÜZELTME: apiToken yerine accessToken
            (token as any).accessToken = data.access_token;
            (token as any).userId = data.user_id;
            (token as any).eula_accepted = data.eula_accepted;
            console.log('✅ Google JWT set for:', data.user_id);
          } else {
            console.error('❌ Backend Google auth failed:', res.status);
          }
        } catch (error) {
          console.error('💥 Google backend error:', error);
        }
      }

      // 3. Session Update Trigger (EulaGuard tetiklediğinde çalışır)
      if (trigger === "update" && session?.eula_accepted !== undefined) {
         (token as any).eula_accepted = session.eula_accepted;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      // DÜZELTME: apiToken yerine accessToken olarak session'a aktarıyoruz
      (session as any).accessToken = (token as any).accessToken ?? null;
      (session as any).userId = (token as any).userId ?? null;
      
      // session.user.eula_accepted olarak erişilebilecek
      if (session.user) {
        (session.user as any).eula_accepted = (token as any).eula_accepted;
      }
      
      return session;
    },
  },
  
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { 
    signIn: "/login"
  },
});

export { handler as GET, handler as POST };