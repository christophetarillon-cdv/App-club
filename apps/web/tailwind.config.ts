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
        headerBg: colors.headerBg,
        welcomeText: colors.welcomeText,
        orange: colors.orange,
        orangeDark: colors.orangeDark,
        cardTeal: colors.cardTeal,
        cardTealDark: colors.cardTealDark,
      },
    },
  },
  plugins: [],
};

export default config;
