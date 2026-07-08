// Design tokens — same values consumed by Tailwind (web) and NativeWind (mobile)
export const colors = {
  primary: '#2563EB',
  secondary: '#F5A83A',
  background: '#F9F7F4',
  surface: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  error: '#EF4444',
  success: '#22C55E',
  border: '#E5E7EB',
  // Identité visuelle mobile
  headerBg: '#BDE0EF',
  welcomeText: '#3A7FA0',
  orange: '#F5A83A',
  orangeDark: '#E8951F',
  cardTeal: '#4A8B9C',
  cardTealDark: '#3A7080',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
