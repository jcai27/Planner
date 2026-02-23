import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        mist: "#f1f5f9",
        clay: "#b45309",
        tide: "#155e75",
        pine: "#065f46"
      }
    }
  },
  plugins: []
};

export default config;
