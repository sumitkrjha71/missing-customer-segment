import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import { TabNav } from "@/components/TabNav";

export const metadata: Metadata = {
  title: "Missing Customer Segment & CSM",
  description: "Internal tool for classifying enterprises into customer segments and assigning missing CSMs",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <Providers>
          {session?.user && (
            <>
              <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
                  <Link href="/" className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-ink text-xs font-bold text-white">
                      MS
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      Missing Customer Segment &amp; CSM
                    </span>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-muted sm:inline">
                      {session.user.email}
                    </span>
                    {session.user.role === "ADMIN" && (
                      <span className="pill bg-slate-100 text-slate-600">ADMIN</span>
                    )}
                    <form
                      action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/signin" });
                      }}
                    >
                      <button className="btn-ghost text-xs">Sign out</button>
                    </form>
                  </div>
                </div>
              </header>
              <TabNav />
            </>
          )}
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
