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
        primary: "var(--primary)",
        ["primary-light"]: "var(--primary-light)",
        ["primary-dark"]: "var(--primary-dark)",
        background: "var(--background)",
        ["background-light"]: "var(--background-light)",
        ["background-lighter"]: "var(--background-lighter)",
        foreground: "var(--foreground)",
        ["foreground-light"]: "var(--foreground-light)",
        ["foreground-dark"]: "var(--foreground-dark)",
      },
      maxHeight: {
        "screen-4/5": "80vh",
        "screen-3/5": "60vh",
        "screen-2/5": "40vh",
        "screen-1/5": "20vh",
      },
    },
  },
  plugins: [],
};
export default config;
