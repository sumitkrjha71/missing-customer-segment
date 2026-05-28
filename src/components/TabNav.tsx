"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; description: string }[] = [
  {
    href: "/",
    label: "Pending Queue",
    description: "Accounts awaiting a segment decision",
  },
  {
    href: "/resolved",
    label: "Resolved",
    description: "One row per assigned/churned account — the DB-handover artifact",
  },
  {
    href: "/activity",
    label: "Activity Log",
    description: "Chronological record of every change made on this portal",
  },
];

/**
 * App-wide tab strip rendered under the header. Highlights the active tab from
 * the current pathname. Kept in a client component because `usePathname` is.
 */
export function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto max-w-7xl px-4">
        <ul className="flex gap-1">
          {TABS.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  title={t.description}
                  className={
                    "inline-block border-b-2 px-3 py-3 text-sm transition " +
                    (active
                      ? "border-ink font-medium text-ink"
                      : "border-transparent text-muted hover:text-ink")
                  }
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
