# 🎉 FFDanse - Déploiement sur Vercel

Guide complet pour déployer l'application FFDanse sur Vercel.

## 📋 Prérequis

1. **Compte Vercel** : https://vercel.com
2. **Compte GitHub** : Repo `cdv-app` dans GitHub
3. **Secrets GitHub** configurés

## 🚀 Déploiement initial

### Étape 1 : Connecter Vercel à GitHub

1. Allez sur https://vercel.com/new
2. Sélectionnez "Import Git Repository"
3. Choisissez le repo `cdv-app`
4. Configurez :
   - **Root Directory** : `apps/ffdanse-web`
   - **Framework Preset** : Next.js
   - **Build Command** : `npm run build`
   - **Output Directory** : `.next`

### Étape 2 : Ajouter les variables d'environnement

Dans Vercel Settings → Environment Variables :

```
FFDANSE_PASSWORD = votre-clé-secrète
```

### Étape 3 : Déployer

Vercel devrait déployer automatiquement. La première fois, vous aurez besoin du CSV initial.

## 📅 Mise à jour mensuelle (GitHub Actions)

### Configuration des secrets GitHub

Allez dans Settings → Secrets and variables → Actions :

1. **VERCEL_TOKEN** : Jeton d'accès Vercel
   - Créez sur : https://vercel.com/account/tokens
   
2. **VERCEL_PROJECT_ID** : ID du projet Vercel
   - Trouvez dans Vercel → Project Settings
   
3. **VERCEL_ORG_ID** : ID de l'organisation Vercel
   - Trouvez dans Vercel → Team Settings

### Le workflow

Le fichier `.github/workflows/ffdanse-update.yml` s'exécute :
- **Chaque 1er du mois à 2h du matin** (UTC)
- Peut être déclenché manuellement via Actions

Processus :
1. Récupère les données du site FFDanse
2. Génère le CSV
3. Push la mise à jour sur GitHub
4. Redéploie automatiquement sur Vercel

## 🔄 Utilisation

1. Accédez à `https://ffdanse.vercel.app` (ou votre domaine)
2. Entrez la clé secrète configurée
3. Recherchez et explorez l'annuaire
4. Téléchargez les données en CSV

## 🔐 Sécurité

- ✅ Clé secrète requise pour accéder
- ✅ Aucune authentification complexe (simple clé)
- ✅ Données CSV publiques (téléchargeables)
- ✅ Pas de stockage de données utilisateur

## 📊 Données

- **Source** : Site FFDanse
- **Format** : CSV (séparateur `;`, UTF-8 BOM)
- **Localisation** : `apps/ffdanse-web/public/data/structures.csv`
- **Mise à jour** : Mensuelle via GitHub Actions

## 🛠️ Développement local

```bash
cd apps/ffdanse-web
npm install
npm run dev
```

Puis ouvrez http://localhost:3000

Clé de test : `ffdanse2026` (par défaut)

## 📞 Dépannage

### "Données non trouvées"
- Le CSV n'a pas encore été généré
- Exécutez le workflow GitHub Actions manuellement

### "Clé incorrecte"
- Vérifiez la variable `FFDANSE_PASSWORD` dans Vercel

### "API Error"
- Vérifiez les logs Vercel → Deployments → Logs
- Assurez-vous que le CSV existe dans `public/data/`

## 📝 Maintenance

- Vérifiez les logs du workflow GitHub Actions mensuels
- Surveiller les erreurs de déploiement Vercel
- Mettre à jour les dépendances (npm)

---

**Version** : 1.0  
**Dernière mise à jour** : 2026-08-06
