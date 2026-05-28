import type { AppRole } from "@/lib/auth";
import "next-auth";
import "next-auth/jwt";

// Augment NextAuth's types so `session.user.role` and `token.role` are typed.
declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: AppRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
  }
}
