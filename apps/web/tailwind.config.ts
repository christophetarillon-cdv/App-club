import type { Config } from 'tailwindcss';
import { colors } from '@cdv/ui';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        background: colors.background,
        surface: colors.surface,
      },
    },
  },
  plugins: [],
};

export default config;
