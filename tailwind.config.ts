import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep indigo "night room" base
        ink: {
          950: "#0C0A14",
          900: "#12101E",
          800: "#1A1730",
          700: "#241F3F",
          600: "#332B57",
        },
        // Magenta "live" signal — the one bold accent
        signal: {
          400: "#FF7AB6",
          500: "#FF4D8D",
          600: "#E63677",
        },
        mint: "#5EE6A8", // semantic: "in sync"
        amber: "#FFC24B", // semantic: "buffering / waiting"
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,77,141,0.25), 0 8px 40px -12px rgba(255,77,141,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
