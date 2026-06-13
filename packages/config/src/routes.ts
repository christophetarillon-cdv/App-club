// Shared route constants — used by web (Next.js) and referenced by mobile navigation
export const ROUTES = {
  home: '/',
  admin: {
    root: '/admin',
    clubSettings: '/admin/club-settings',
  },
} as const;
