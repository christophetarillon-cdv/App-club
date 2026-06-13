// Design tokens — same values consumed by Tailwind (web) and NativeWind (mobile)
export const colors = {
  primary: '#1B3A6B',
  secondary: '#E8B84B',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  error: '#DC2626',
  success: '#16A34A',
  border: '#E5E7EB',
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
