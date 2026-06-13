# Spécifications fonctionnelles — CDV App

## Vision
Application de gestion du Club de Danse Voiron / Coublevie.

## Briques

| Brique | Titre | Statut |
|--------|-------|--------|
| 0 | Fondations techniques (monorepo, Firebase, admin club) | ✅ En cours |
| 1 | Authentification & gestion des membres | 🔜 |
| 2 | Calendrier des cours & événements | 🔜 |
| 3 | Inscriptions & paiements | 🔜 |
| 4 | Communication (actualités, notifications) | 🔜 |
| 5 | App mobile (tablette + scan QR) | 🔜 |

## Environnements Firebase
- **dev** : `cdv-app-dev` — développement local
- **beta** : `cdv-app-beta` — tests utilisateurs
- **prod** : `cdv-app-prod` — production

## Collection Firestore : `clubProfile`
Document unique : `clubProfile/main`

| Champ | Type | Description |
|-------|------|-------------|
| officialName | string | Nom officiel de l'association |
| shortName | string | Nom court |
| legalStatus | string | ex : Association loi 1901 |
| mainPhone | string | Téléphone principal |
| mainEmail | string | Email principal |
| websiteUrl | string | URL du site |
| headquartersAddress | map | Adresse du siège |
| logoUrl | string | URL du logo |
| primaryColor | string | Couleur principale (hex) |
| shortDescription | string | Description courte |
| createdAt | timestamp | Création |
| updatedAt | timestamp | Dernière modification |
