import type { Config } from "tailwindcss";
import { uiTailwindPreset } from "@restaurant-os/ui/tailwind-preset";

const config: Config = {
  presets: [uiTailwindPreset as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ]
};

export default config;
