export const brandColors = {
  brand: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d"
  }
};

export const uiTailwindPreset = {
  theme: {
    extend: {
      colors: brandColors,
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      spacing: {
        18: "4.5rem"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  }
};
