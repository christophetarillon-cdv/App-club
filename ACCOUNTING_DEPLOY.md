# 🚀 Déploiement Phase 1 — Comptabilité CDCV

**Guide étape par étape pour déployer et tester la comptabilité**

---

## Step 1️⃣ : Build & Deploy Functions

```bash
cd /Users/christophetarillon/Developer/cdv-app

# Build les functions (TypeScript → JavaScript)
npm run deploy:functions

# ou pour production
npm run deploy:functions:prod
```

**Qu'est-ce qui se passe** :
- Compilation TypeScript
- Déploiement Cloud Functions
  - `onPaymentCreated` (déclenché : paiement créé)
  - `aggregateAccountingData` (déclenché : écriture modifiée)
  - `initializeAccounting` (callable : initialisation)

---

## Step 2️⃣ : Deploy Firestore Rules

```bash
npm run deploy:rules
```

**Qu'est-ce qui se passe** :
- Déploiement des règles Firestore (sécurité)
- Activation des 8 collections comptables
- Rôle `comptable` reconnu

---

## Step 3️⃣ : Initialiser la comptabilité

### Via Firebase Console (Admin SDK)

```bash
# Option 1 : Cloud Console
# Aller dans Firebase Console → Functions → initializeAccounting
# Cliquer "Test the function"
# Ajouter auth token d'un admin
# Exécuter
```

### Ou via code (Node.js)

```bash
cd functions

node -e "
const admin = require('firebase-admin');
admin.initializeApp();

admin.firestore()
  .collection('chartOfAccounts')
  .get()
  .then(snap => console.log('Accounts count:', snap.size));
"
```

---

## Step 4️⃣ : Vérifier les collections

### Ouvrir Firebase Console

```
https://console.firebase.google.com
↓
Sélectionner projet (cdv-dev ou cdv-prod)
↓
Cloud Firestore
↓
Collections créées :
  ✅ chartOfAccounts (13 docs)
  ✅ bankAccounts (5 docs)
  ✅ accountingEntries (0, vide)
  ✅ bankStatements (0, vide)
  ✅ bankReconciliations (0, vide)
  ✅ ventilationSummaries (0, vide)
  ✅ balanceSheets (0, vide)
  ✅ accountingDocuments (0, vide)
```

**Si collectio pas visibles** :
1. Appeler `initializeAccounting` (voir Step 3)
2. Rafraîchir la page Firebase

---

## Step 5️⃣ : Tester l'automatisation

### 5a. Créer un paiement de test

Via l'app CDCV admin :

```
/admin/payments/new
↓
Créer un paiement test :
  - Montant : 50 €
  - Catégorie : "adhesion" ou "cotisation"
  - Compte bancaire : "CE_PRINCIPAL"
  - Saison : "2024-2025"
↓
Cliquer "Créer"
```

### 5b. Vérifier la création d'écriture

Aller dans Firebase Console :

```
Cloud Firestore → accountingEntries
↓
Devrait avoir 1 document :
  - date: [timestamp du maintenant]
  - description: "Paiement - adhesion"
  - debit: {accountCode: "51", amount: 50}
  - credit: {accountCode: "70", amount: 50}
  - bankAccount: "CE_PRINCIPAL"
  - category: "adhesions"
  - relatedPaymentId: "[ID du paiement]"
  - status: "posted"
  - reconciled: false
```

### 5c. Vérifier l'agrégation

Aller dans `balanceSheets` :

```
Devrait avoir 1 document : balance_2024-2025
  - totals.totalRevenue: 50
  - totals.totalExpense: 0
  - totals.netResult: 50
  - byAccount["51"] (Banque): {balance: 50}
  - byAccount["70"] (Cotisations): {balance: -50}
```

Aller dans `ventilationSummaries` :

```
Devrait avoir 2 documents :
  1. vent_2024-2025_2024-09 (mensuel)
  2. vent_2024-2025_2024-2025 (saison)

Chacun doit avoir :
  - byCategory.adhesions: {revenue: 50, count: 1}
  - byBankAccount.CE_PRINCIPAL: {credit: 50, debit: 0, balance: 50}
  - totals.totalRevenue: 50
  - totals.netResult: 50
```

---

## Step 6️⃣ : Créer 2-3 paiements supplémentaires

Pour tester que les agrégations se mettent à jour :

```
Paiement 1: 50 € (adhesion, CE_PRINCIPAL)
Paiement 2: 30 € (cours, PAYPAL)
Paiement 3: 80 € (adhesion, CE_PRINCIPAL)
↓
Les agrégations doivent recalculer :
  - balanceSheets[balance_2024-2025]:
    - byAccount["51"]: balance = 130
    - byAccount["54"]: balance = 30
    - totals.totalRevenue = 160
```

---

## ✅ Checklist de validation

- [ ] Cloud Functions déployées sans erreur
- [ ] Firestore rules mises à jour
- [ ] Collections comptables visibles dans Firebase Console
- [ ] Plan comptable (13 comptes) présent
- [ ] Comptes bancaires (5) présents
- [ ] 1er paiement crée 1 entry automatiquement
- [ ] Entry contient debit/credit corrects
- [ ] BalanceSheet recalculé avec montant correct
- [ ] VentilationSummary mensuelle et saison créées
- [ ] 2e paiement recalcule agrégations

---

## 🐛 Troubleshooting

### Cloud Function ne déclenche pas (onPaymentCreated)

**Symptômes** : Créer un paiement → aucune entry créée

**Solutions** :
1. Vérifier que les functions sont déployées
   ```bash
   firebase functions:list
   ```
   Devrait montrer `onPaymentCreated`, `aggregateAccountingData`, `initializeAccounting`

2. Vérifier les logs
   ```bash
   firebase functions:log
   ```
   Chercher erreurs dans `onPaymentCreated`

3. Vérifier que la collection `payments` existe et paiement bien créé

### Collections pas visibles

**Symptômes** : Firebase Console ne montre pas les collections

**Solutions** :
1. Appeler `initializeAccounting()` explicitement
2. Rafraîchir page Firebase
3. Vérifier qu'au moins 1 écriture a été créée

### Agrégations pas mises à jour

**Symptômes** : Paiement créé, entry présente, mais balanceSheet pas créé

**Solutions** :
1. Vérifier que `aggregateAccountingData` est déployée
2. Vérifier les logs Cloud Functions pour erreurs
3. Vérifier que chartOfAccounts existe et contient les comptes

---

## 📊 Exemple données après tests

Si tout fonctionne, vous devriez avoir :

**Collections** :
- `chartOfAccounts` : 13 documents
- `bankAccounts` : 5 documents
- `accountingEntries` : 3+ documents (les paiements)
- `balanceSheets` : 1 document (balance_2024-2025)
- `ventilationSummaries` : 2 documents (mois + saison)

**Exemple entry** :
```json
{
  "id": "auto_generated_id",
  "seasonId": "2024-2025",
  "date": 1725600000000,
  "description": "Paiement - adhesion",
  "debit": {"accountCode": "51", "amount": 50},
  "credit": {"accountCode": "70", "amount": 50},
  "bankAccount": "CE_PRINCIPAL",
  "transactionType": "deposit",
  "category": "adhesions",
  "tags": ["2024-2025"],
  "reconciled": false,
  "relatedPaymentId": "payment_xyz",
  "status": "posted",
  "createdAt": 1725600000000,
  "createdBy": "system-payment"
}
```

**Exemple balanceSheet** :
```json
{
  "id": "balance_2024-2025",
  "seasonId": "2024-2025",
  "asOf": 1725600000000,
  "byAccount": {
    "51": {
      "label": "Banque - Chèques",
      "type": "asset",
      "debit": 160,
      "credit": 0,
      "balance": 160
    },
    "70": {
      "label": "Cotisations adhérents",
      "type": "income",
      "debit": 0,
      "credit": 130,
      "balance": -130
    },
    "71": {
      "label": "Cours",
      "type": "income",
      "debit": 0,
      "credit": 30,
      "balance": -30
    }
  },
  "totals": {
    "totalAssets": 160,
    "totalLiabilities": 0,
    "totalEquity": 0,
    "netResult": 160
  },
  "calculatedAt": 1725600000000
}
```

---

## 📞 Prochaines étapes (Phase 2)

Après validation Phase 1 :

1. Créer pages React (`/admin/accounting/*`)
2. Ajouter saisie manuelle pour charges/subventions
3. Implémenter imports CSV/OFX
4. Ajouter rapprochement bancaire interactif
5. Générer exports PDF/Excel

---

✅ **Phase 1 prête à déployer !**

Questions ? Voir `ACCOUNTING_PHASE1.md` ou `apps/accounting/README.md`
