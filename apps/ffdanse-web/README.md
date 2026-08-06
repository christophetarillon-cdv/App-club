# FFDanse Web - Vercel

Application web de recherche d'annuaire FFDanse hébergée sur Vercel.

## 🚀 Démarrage

```bash
cd apps/ffdanse-web
npm install
npm run dev
```

## 🔐 Configuration

Variables d'environnement (`.env.local`) :
```
FFDANSE_PASSWORD=votre-clé-secrète
FFDANSE_SECRET=votre-secret-clé
```

## 📁 Structure des données

Les données CSV doivent être placées dans :
```
public/data/structures.csv
```

Ce fichier est mis à jour mensuellement via GitHub Actions.

## 🔄 Mise à jour des données

Via `.github/workflows/ffdanse-update.yml` (cron job mensuel)
