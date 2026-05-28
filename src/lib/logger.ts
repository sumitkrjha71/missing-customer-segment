/**
 * Tiny structured logger. Emits one JSON line per event so Vercel's log drain
 * (or `vercel logs`) can be filtered/grepped. No dependency — intentionally simple.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}) =>
    emit("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    emit("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    emit("error", event, fields),
};
