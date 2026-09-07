const config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderWidth: {
        1: "1px",
      },
      colors: {
        primary: "var(--primary)",
        ["primary-light"]: "var(--primary-light)",
        ["primary-dark"]: "var(--primary-dark)",
        disabled: "var(--disabled)",
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
