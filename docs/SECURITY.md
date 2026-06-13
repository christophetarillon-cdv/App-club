# Sécurité — CDV App

## Règles générales

- Ne jamais committer de fichiers `.env` (ils sont dans `.gitignore`)
- La clé `FIREBASE_SERVICE_ACCOUNT_KEY` ne doit jamais être exposée côté client
- Les clés `NEXT_PUBLIC_*` sont publiques par nature — ne jamais y mettre de secrets

## Gestion des secrets

| Secret | Stockage | Accès |
|--------|----------|-------|
| Firebase Service Account | Variables CI/CD (GitHub Secrets) | Server-side uniquement |
| Clés Firebase client | `.env.*.example` → `.env.local` | Client + serveur |

## Firestore Security Rules

À configurer avant la mise en production :
- Lecture `clubProfile/main` : publique
- Écriture `clubProfile/main` : admin uniquement
- Autres collections : authentification requise

## Signaler une vulnérabilité

Envoyer un email à l'administrateur du projet. Ne pas ouvrir d'issue publique.
