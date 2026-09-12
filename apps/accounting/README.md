# Comptabilité CDCV — Module `@cdv/accounting`

## 📋 Phase 1 - Socle comptable (3-4 semaines)

Objectif : Automatiser l'intégration des paiements CDCV en écritures comptables, et fournir les calculs d'agrégation (bilan, ventilation).

### ✅ Livré

#### 1. **Architecture Firestore**

Collections créées :

- **`chartOfAccounts/{id}`** — Plan comptable (codes 51, 70, 62, etc.)
  - Contient le plan comptable par défaut pour associations
  - Modifiable via page admin

- **`bankAccounts/{id}`** — Comptes bancaires/caisses (Caisse Épargne, PayPal, Caisse espèces, etc.)
  - 5 comptes par défaut (CE_PRINCIPAL, CE_LIVRET, PAYPAL, STRIPE, CAISSE)
  - Lien vers écritures comptables

- **`accountingEntries/{id}`** — Journal des écritures
  - Débit/Crédit (comptabilité formelle)
  - Lien vers compte bancaire (suivi pratique comme votre modèle)
  - Catégorisation analytique (adhésions, cours, subventions, etc.)
  - Statut : `draft` | `posted`
  - Rapprochement : `reconciled: boolean`

- **`bankStatements/{id}`** — Extraits bancaires importés (CSV, OFX)
  - Contient les écritures brutes du relevé
  - Comparaison avec écritures comptables

- **`bankReconciliations/{id}`** — Rapprochements bancaires
  - Solde officiel (relevé) vs. solde calculé
  - Transactions non pointées (écarts)
  - Statut : `draft` | `partial` | `validated`

- **`ventilationSummaries/{id}`** — Résumés par catégorie et compte
  - Pré-calculés (Cloud Functions)
  - Mensuel + par saison
  - Par catégorie (adhésions, cours, etc.) + par compte bancaire

- **`balanceSheets/{id}`** — Bilans de fin de saison
  - Pré-calculés (Cloud Functions)
  - Un par saison
  - Synthèse actifs/passifs/capitaux propres/résultat

- **`accountingDocuments/{id}`** — Justificatifs (factures, reçus, etc.)
  - Lien vers écriture comptable
  - Stockage Firebase ou Dropbox

#### 2. **Cloud Functions**

Automatisation intégrée :

- **`onPaymentCreated()`** — Déclencheur sur création de paiement CDCV
  - Crée automatiquement une écriture comptable
  - Mappe : catégorie paiement → codes comptables
  - Statut : `posted` directement (pas de validation)

- **`aggregateAccountingData()`** — Déclencheur sur création/modification d'écriture
  - Recalcule le bilan de fin de saison
  - Recalcule la ventilation mensuelle
  - Recalcule la ventilation de la saison
  - 100% automatique, pas de saisie manuelle

- **`initializeAccounting()`** — Callable function (manuel ou automatique au démarrage)
  - Crée le plan comptable par défaut
  - Crée les comptes bancaires par défaut
  - Appelé une fois par club

#### 3. **Types TypeScript**

Fichier `src/types.ts` définit :

- `ChartOfAccount` — Compte comptable
- `BankAccount` — Compte bancaire/caisse
- `AccountingEntry` — Écriture comptable
- `BankStatement` — Extrait bancaire
- `BankReconciliation` — Rapprochement
- `VentilationSummary` — Résumé analytique
- `BalanceSheet` — Bilan
- `AccountingDocument` — Justificatif

#### 4. **Constantes & Utilities**

- **`constants.ts`** — Plan comptable + comptes bancaires par défaut
- **`lib/accounting.ts`** — Fonctions de calcul (soldes, bilan, ventilation, CSV export)

#### 5. **Règles Firestore**

Accès contrôlé via rôle `comptable` ou pages :
- `/admin/accounting/journal` — Saisie écritures
- `/admin/accounting/reconciliation` — Rapprochement
- `/admin/accounting/reports` — Rapports/exports

### 📊 Plan comptable inclus

```
ACTIF
├─ 51 Banque/Chèques
├─ 52 Livrets/Épargne
├─ 53 Caisse espèces
├─ 54 PayPal/Stripe
└─ 41 Créances adhérents

PASSIF
└─ 30 Fonds d'association

PRODUITS
├─ 70 Cotisations adhérents
├─ 71 Cours
├─ 72 Subventions
└─ 73 Autres revenus

CHARGES
├─ 60 Fournitures
├─ 61 Transports
├─ 62 Loyers
├─ 63 Salaires/Intervenants
├─ 64 Assurances
├─ 65 Services externes
└─ 66 Autres charges
```

---

## 🔄 Flux d'automatisation

```
Paiement CDCV créé (app/web)
    ↓
Cloud Function onPaymentCreated
    ├→ Crée AccountingEntry (débit 51, crédit 70)
    ├→ Marque comme `posted`
    └→ Lie relatedPaymentId
         ↓
    aggregateAccountingData déclenchée
         ├→ Recalcule BalanceSheet
         ├→ Recalcule VentilationSummary (mois)
         └→ Recalcule VentilationSummary (saison)
```

Aucune saisie manuelle pour les cotisations/cours = zéro double saisie.

---

## ⚙️ Configuration requise

### 1. Initialisation (une fois)

```typescript
// Appel Cloud Function depuis admin
await initializeAccounting()
```

Cela crée :
- 13 comptes comptables
- 5 comptes bancaires par défaut

### 2. Mapping des paiements CDCV

Dans `onPaymentCreated()`, adapter les fonctions :
- `getCategoryAccountCode()` — Catégorie → Code comptable
- `mapPaymentCategoryToAccounting()` — Catégorie → Catégorie analytique

Actuellement :
- `adhesion` / `cotisation` → 70 (Cotisations)
- `cours` → 71 (Cours)
- `subvention` → 72 (Subventions)

### 3. Personnalisation du plan comptable

Si votre plan comptable diffère (comptes différents, codes différents) :

1. Modifiez `DEFAULT_CHART_OF_ACCOUNTS` dans `constants.ts`
2. Appelez `initializeAccounting()` à nouveau
3. Adaptez les mappings dans `onPaymentCreated()`

---

## 🚀 Phase 2 - Interfaces (2 semaines)

À venir :

- **Page Journal** — Liste/saisie des écritures
- **Page Rapprochement** — Interface pointage bancaire
- **Page Ventilations** — Tableaux analytiques par catégorie/compte
- **Exports** — PDF bilan, P&L, détails

---

## 📝 Notes de développement

- Pas de validation complexe : entrées marquées `posted` directement
- Pas d'approbation : chaque créateur peut modifier ses écritures `draft`
- Pas d'expert-comptable : export simple PDF/Excel, pas de normes FEC
- Agrégations pré-calculées : chaque écriture recalcule les totaux (Cloud Functions)

---

## 🔗 Références

- Types : `src/types.ts`
- Constantes : `src/constants.ts`
- Calculs : `src/lib/accounting.ts`
- Cloud Functions : `functions/src/accounting/`
- Règles Firestore : `firestore.rules` (section `// ── comptabilité`)

---

## ❓ Questions / Personnalisation

Contact : voir CLAUDE.md

