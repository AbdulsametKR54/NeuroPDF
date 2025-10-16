import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth.config";

export async function middleware(req: NextRequest) {
  const session = await auth();
  const needsAuth = req.nextUrl.pathname.startsWith("/dashboard");
  if (needsAuth && !session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
