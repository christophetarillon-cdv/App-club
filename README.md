# CDV App — Club de Danse Voiron / Coublevie

Application de gestion du club : web (Next.js) + mobile (React Native / Expo, Brique 5).

## Prérequis

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Comptes Firebase (3 projets : dev, beta, prod)

## Installation

```bash
git clone <repo>
cd cdv-app
pnpm install
```

## Configuration Firebase

1. Copiez les fichiers d'exemple selon l'environnement :
   ```bash
   cp .env.dev.example .env.local   # pour le développement local
   ```
2. Renseignez les valeurs Firebase depuis la console Firebase de votre projet dev.
3. Ne jamais committer les fichiers `.env` réels.

## Commandes

| Commande | Action |
|----------|--------|
| `pnpm dev` | Lance tous les apps en mode dev |
| `pnpm build` | Build de production (tous les packages) |
| `pnpm lint` | Lint (ESLint) sur tout le monorepo |
| `pnpm type-check` | Vérification TypeScript |
| `pnpm clean` | Supprime tous les build artifacts |

Pour lancer uniquement le web :
```bash
cd apps/web && pnpm dev
```

## Structure du monorepo

```
cdv-app/
├── apps/
│   └── web/              ← Next.js 14 (TypeScript + Tailwind)
├── packages/
│   ├── firebase/         ← Init Firebase client (platform-agnostique)
│   ├── types/            ← Types TypeScript partagés
│   ├── core/             ← Services métier (platform-agnostique)
│   ├── ui/               ← Design tokens partagés
│   └── config/           ← Constantes, env, routes
├── functions/            ← Firebase Cloud Functions v2
└── docs/                 ← Documentation
```

> `apps/mobile` (React Native + Expo) sera ajouté à la Brique 5.

## Environnements Firebase

| Env | Projet Firebase | Usage |
|-----|----------------|-------|
| dev | `cdv-app-dev` | Développement local |
| beta | `cdv-app-beta` | Tests utilisateurs |
| prod | `cdv-app-prod` | Production |

## Pages admin

| Route | Description |
|-------|-------------|
| `/admin/club-settings` | Paramètres du club (profil, contact, adresse) |

## Firestore — Collections

| Collection | Document | Description |
|-----------|----------|-------------|
| `clubProfile` | `main` | Profil unique du club |

## Contribuer

Branches : `main` (prod) · `develop` (intégration) · `feature/*` (fonctionnalités)

Voir `docs/DECISIONS.md` pour les choix techniques et `docs/SPECS.md` pour les spécifications.
