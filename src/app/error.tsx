"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the browser console; server logs capture the real stack.
    console.error("UI error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        The page hit an unexpected error. Your data is safe — no changes are
        applied unless an action confirms success.
      </p>
      <button onClick={reset} className="btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
