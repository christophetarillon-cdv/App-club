# Changelog — CDV App

## [0.0.1] — 2026-05-27

### Ajouté
- Structure monorepo Turborepo + pnpm workspaces
- `apps/web` : Next.js 14 + TypeScript + Tailwind
- `packages/types` : types partagés (ClubProfile, AppUser, common)
- `packages/firebase` : init client Firebase platform-agnostique + refs collections
- `packages/core` : service club (getClubProfile, updateClubProfile)
- `packages/ui` : design tokens partagés (colors, spacing, borderRadius)
- `packages/config` : env utils + routes constants
- Page admin `/admin/club-settings` : formulaire 10 champs ClubProfile
- 3 fichiers `.env.*.example` (dev, beta, prod)
- GitHub Actions : lint + type-check
- Documentation initiale (SPECS, DECISIONS, SECURITY)
