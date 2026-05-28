import { auth, type AppRole } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor(message = "UNAUTHENTICATED") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface Actor {
  email: string;
  name: string | null;
  role: AppRole;
}

/**
 * Resolve the current actor from the session, or throw. Use at the top of every
 * Server Action and authenticated Route Handler. `actor.email` is the ONLY
 * trusted source of identity for audit — never accept it from the client.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new UnauthorizedError();
  return {
    email,
    name: session.user?.name ?? null,
    role: session.user?.role ?? "CSM",
  };
}

/** Require ADMIN; throws ForbiddenError for a plain CSM. */
export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") throw new ForbiddenError();
  return actor;
}
