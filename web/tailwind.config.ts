import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rating: {
          buy: "#16a34a",
          hold: "#a3a3a3",
          sell: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
