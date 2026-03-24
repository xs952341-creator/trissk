import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["DM Sans",    "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Syne",       "-apple-system", "sans-serif"],
        mono:    ["DM Mono",    "ui-monospace", "Cascadia Code", "monospace"],
      },
      colors: {
        brand: {
          DEFAULT: "#22d4a0",
          dim:     "#0fa37e",
          dark:    "#0a7a5f",
          light:   "#30e6b0",
        },
        surface: {
          0: "#080b0e",
          1: "#0d1117",
          2: "#141b22",
          3: "#1c2633",
          4: "#243040",
        },
      },
      animation: {
        "shimmer":        "shimmer 1.8s ease infinite",
        "skeleton":       "skeleton-shimmer 1.6s ease infinite",
        "gradient-shift": "gradient-shift 5s ease infinite",
        "fade-in":        "fadeIn 0.3s ease",
        "fade-in-up":     "fade-in-up 0.5s ease forwards",
        "slide-up":       "slideUp 0.3s ease",
        "float":          "float 4s ease-in-out infinite",
        "pulse-glow":     "pulse-glow 2s ease-in-out infinite",
        "spin-slow":      "spin-slow 3s linear infinite",
        "border-pulse":   "border-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "skeleton-shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "gradient-shift": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%":     { backgroundPosition: "100% 50%" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%":     { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.4" },
          "50%":     { opacity: "0.8" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "border-pulse": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(34,212,160,0)" },
          "50%":     { boxShadow: "0 0 0 4px rgba(34,212,160,0.15)" },
        },
      },
      boxShadow: {
        "brand":     "0 0 24px rgba(34,212,160,0.18),0 0 64px rgba(34,212,160,0.06)",
        "brand-lg":  "0 0 40px rgba(34,212,160,0.28),0 0 80px rgba(34,212,160,0.1)",
        "card":      "0 1px 2px rgba(0,0,0,0.3),0 4px 16px rgba(0,0,0,0.2)",
        "elevated":  "0 8px 32px rgba(0,0,0,0.4),0 1px 2px rgba(0,0,0,0.3)",
        "modal":     "0 24px 64px rgba(0,0,0,0.6)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
