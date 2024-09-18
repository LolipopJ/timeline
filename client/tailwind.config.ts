import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // #region Resolve react-transition-group styles
    {
      pattern: /^.+-enter(-active|-done)?$/,
    },
    {
      pattern: /^.+-appear(-active|-done)?$/,
    },
    {
      pattern: /^.+-exit(-active|-done)?$/,
    },
    // #endregion
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        ["background-1"]: "var(--background)",
        ["background-2"]: "var(--background-2)",
        ["background-3"]: "var(--background-3)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
