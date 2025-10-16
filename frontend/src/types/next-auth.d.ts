import { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    // Add your custom property here
    apiToken?: string;
    // And extend the user object to match your session callback
    user: DefaultSession["user"] & { id?: string };
  }
}
