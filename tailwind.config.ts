import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: "#171717",
        main: "#212121",
        input: "#2f2f2f",
        border: "#3f3f3f",
        accent: "#10a37f",
      },
    },
  },
  plugins: [],
};
export default config;
