import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // operational status palette
        ok: "#16a34a",
        warn: "#d97706",
        danger: "#dc2626",
        ink: "#0f172a",
        muted: "#64748b",
        surface: "#f8fafc",
        line: "#e2e8f0",
      },
    },
  },
  plugins: [],
};

export default config;
