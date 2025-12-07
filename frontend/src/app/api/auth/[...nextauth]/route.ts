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
          console.log('🔐 Attempting login:', credentials.email);
          
          const res = await fetch(`${process.env.BACKEND_API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          console.log('📡 Backend response:', res.status);

          if (!res.ok) {
            const errorText = await res.text();
            console.error('❌ Login failed:', errorText);
            return null;
          }

          const data = await res.json();
          console.log('✅ Login success:', data.user_id);
          
          // Backend'den gelen veriyi NextAuth formatına çevir
          return {
            id: data.user_id,
            email: data.email,
            name: data.username,
            apiToken: data.access_token,
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
    async jwt({ token, account, user }) {
      // Credentials login - user objesi ilk login'de gelir
      if ((user as any)?.apiToken) {
        (token as any).apiToken = (user as any).apiToken;
        (token as any).userId = user.id;
        console.log('✅ Credentials JWT set for:', user.id);
      }
      
      // Google login - account.id_token var
      if (account?.id_token) {
        console.log('🔐 Google login, fetching backend token...');
        try {
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
            console.log('✅ Google JWT set for:', data.user_id);
          } else {
            console.error('❌ Backend Google auth failed:', res.status);
          }
        } catch (error) {
          console.error('💥 Google backend error:', error);
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
  secret: process.env.NEXTAUTH_SECRET,  // ← .env.local'deki değişken
  pages: { 
    signIn: "/login"  // ← Login page yolu
  },
});

export { handler as GET, handler as POST };