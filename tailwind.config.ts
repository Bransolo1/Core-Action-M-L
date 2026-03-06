import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        barlow: ["Barlow", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        brand: {
          red: "#E30713",
          black: "#0A0A0A",
          white: "#FFFFFF",
          gray: "#F4F4F4",
          "dark-gray": "#6B6B6B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
