# Décisions techniques — CDV App

## [2026-05-27] Monorepo Turborepo + pnpm
**Décision :** Utilisation d'un monorepo Turborepo avec pnpm workspaces.
**Raison :** Partage de code entre web et mobile sans duplication. Turborepo gère le cache de build incrémental.

## [2026-05-27] Packages platform-agnostiques
**Décision :** `packages/ui`, `packages/core`, `packages/firebase`, `packages/types`, `packages/config` ne contiennent pas de code spécifique web ou mobile.
**Raison :** Permet d'ajouter `apps/mobile` (Brique 5) sans refactoring.

## [2026-05-27] 3 environnements Firebase distincts
**Décision :** Projets Firebase séparés pour dev, beta et prod.
**Raison :** Isolation complète des données — impossible de polluer la prod depuis le dev.

## [2026-05-27] App mobile différée à la Brique 5
**Décision :** `apps/mobile` (React Native + Expo) sera créé à la Brique 5.
**Raison :** Simplification du setup initial. La structure monorepo est prête pour l'accueillir.
