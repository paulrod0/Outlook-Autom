import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa Grupo Optimus (aprox. del manual de marca).
        optimus: {
          cyan: "#1FBFE8",       // primary brand cyan
          cyanDark: "#1290B5",
          cyanLight: "#BCE5F2",
          navy: "#0F2A4D",       // dark text / headers
          navyDeep: "#081A33",   // app background
          ink: "#1B2747",
          paper: "#F4FBFE",      // page-light cards
          mute: "#8AA0BD",
        },
        // Alias zeus.* mantenidos para no romper componentes legacy; mapean a la nueva paleta.
        zeus: {
          green: "#1FBFE8",
          dark: "#081A33",
          panel: "#0F2A4D",
          accent: "#1290B5",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
