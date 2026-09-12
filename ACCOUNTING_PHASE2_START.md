# 📱 Phase 2 — Interfaces React (Journal) ✅ Démarrée

**Date** : 7 septembre 2026  
**Étape** : 1/4 — Page Journal en place
**Durée estimée** : 2 semaines

---

## ✅ Livrée — Page Journal

### Structure
```
apps/web/src/app/admin/accounting/
├── layout.tsx                          ← Navigation 4 sections
├── journal/
│   └── page.tsx                        ← 📄 PAGE LIVRÉE
├── reconciliation/
│   └── page.tsx                        ← (placeholder)
├── analytics/
│   └── page.tsx                        ← (placeholder)
└── reports/
    └── page.tsx                        ← (placeholder)

apps/web/src/components/accounting/
├── EntryForm.tsx                       ← 📄 LIVRÉE (saisie)
└── EntryTable.tsx                      ← 📄 LIVRÉE (liste)
```

### Fonctionnalités Journal ✅

- **Liste des écritures**
  - ✅ Affichage en tableau (date, libellé, débit/crédit, catégorie, compte, état)
  - ✅ Filtre par saison
  - ✅ Filtre par statut (tous / brouillon / validées)
  - ✅ Tri par date (récent d'abord)
  - ✅ Clique pour détail

- **Formulaire de saisie**
  - ✅ Date
  - ✅ Description
  - ✅ Compte débit (liste déroulante, 11 comptes)
  - ✅ Montant débit
  - ✅ Compte crédit (liste déroulante)
  - ✅ Montant crédit
  - ✅ Compte bancaire (5 options)
  - ✅ Catégorie analytique
  - ✅ Validation : débits = crédits
  - ✅ Créer en Firestore directement
  - ✅ Feedback utilisateur (erreurs, succès)

- **Statistiques en temps réel**
  - ✅ Total débits / Total crédits / Nombre écritures
  - ✅ Mise à jour automatique avec Firestore

### Code pattern

```typescript
// Hooks Firebase
useFirestore()           // Accès DB
useUser()               // Auth user

// Realtime listener
onSnapshot(query, (snap) => {
  // Recharge au changement
})

// Create entry
addDoc(collection(db, 'accountingEntries'), {
  seasonId, date, description,
  debit, credit, bankAccount,
  category, status: 'posted', ...
})
```

---

## 📋 Prochaines étapes (Phase 2)

### Étape 2 : Rapprochement bancaire (1 sem)
**Fichiers à créer** :
- `reconciliation/page.tsx` (développer)
- `components/accounting/BankStatementImport.tsx` (import CSV)
- `components/accounting/ReconciliationTable.tsx` (lettrage)
- `components/accounting/MatchingUI.tsx` (interface pointage)

**Tâches** :
- [ ] Upload CSV/OFX
- [ ] Parser CSV → tableau
- [ ] Interface matching (écriture ↔ ligne extract)
- [ ] Sauvegarde pointage

### Étape 3 : Ventilations analytiques (1 sem)
**Fichiers à créer** :
- `analytics/page.tsx` (développer)
- `components/accounting/VentilationTable.tsx` (tableaux)
- `components/accounting/VentilationChart.tsx` (optionnel : graphique)

**Tâches** :
- [ ] Lire `ventilationSummaries` Firestore
- [ ] Afficher par catégorie (adhésions, cours, subventions)
- [ ] Afficher par compte bancaire
- [ ] Totaux et pourcentages

### Étape 4 : Rapports & Exports (1 sem)
**Fichiers à créer** :
- `reports/page.tsx` (développer)
- `components/accounting/BalanceSheetReport.tsx` (bilan)
- `components/accounting/IncomeStatementReport.tsx` (P&L)
- `lib/accounting/exports.ts` (PDF/Excel generation)

**Tâches** :
- [ ] Afficher bilan (actifs/passifs/capitaux)
- [ ] Afficher compte de résultat (produits/charges)
- [ ] Bouton export PDF
- [ ] Bouton export Excel
- [ ] Détails par catégorie en annexe

---

## 🏗️ Architecture Phase 2

### State Management
```typescript
// Données lues de Firestore directement
// Pas de Redux/Zustand pour MVP

entries: Entry[]           // Réception realtime
ventilations: Summary[]    // Récalculées auto (CF)
balanceSheets: Sheet[]     // Récalculées auto (CF)
```

### Validation Data
- ✅ Firestore rules (côté serveur)
- ✅ TypeScript types (côté client)
- ✅ Checks simples (débits = crédits)

### Erreurs gérées
```typescript
try {
  addDoc(...)
  onSuccess()
} catch (err) {
  setError(err.message)
}
```

---

## 🎨 Design Consistency

### Pattern utilisé
```typescript
// Toutes les pages
<div className="space-y-6">
  <Filters />        // Sélecteurs
  <ActionBar />      // Boutons
  <Content />        // Tableau/Forme
  <Stats />          // Totaux
</div>

// Couleurs
bg-blue-500         // Actions primaires
bg-green-600        // Succès
bg-red-600          // Erreurs
bg-gray-100         // Backgrounds
```

### Composants réutilisables
- `EntryForm` — Saisie (réutilisable)
- `EntryTable` — Liste + détail (réutilisable)
- À créer :
  - `BalanceSheet` — Affichage bilan
  - `VentilationTable` — Tableaux analytiques
  - `ExportButton` — Générer PDF/Excel

---

## 🔗 Dépendances Phase 2

### Firestore collections utilisées
- ✅ `accountingEntries` — Journal (créé depuis form)
- ✅ `ventilationSummaries` — Auto-créé par CF
- ✅ `balanceSheets` — Auto-créé par CF
- ⏳ `bankStatements` — À créer via import

### Libraries (existantes dans le projet)
```
// Probablement déjà dispo
firebase/firestore    ✅ onSnapshot, addDoc, query, where, orderBy
react                 ✅ useState, useEffect
next                  ✅ 'use client', routing

// À ajouter si besoin
pdfkit ou jsPDF       (pour exports PDF)
xlsx                  (pour exports Excel)
papaparse            (pour import CSV)
```

---

## ✅ Checklist avant de coder Phase 2.2

- [ ] Journal page compilable (importer depuis web)
- [ ] Vérifier que `useFirestore()` et `useUser()` existent
- [ ] Tester création écriture via form (check Firestore)
- [ ] Vérifier que `ventilationSummaries` se crée auto (CF)
- [ ] Vérifier que `balanceSheets` se crée auto (CF)
- [ ] Décider : utiliser libs existantes ou ajouter pdfkit/xlsx

---

## 📝 Notes développement

- **Realtime first** : `onSnapshot` pour tout
- **CRUD simple** : Pas de PUT/DELETE pour MVP (draft-only = création)
- **Pas de permissions UI** : Firestore rules gèrent l'accès
- **Pas de cache** : Firestore = source of truth
- **Mobile-friendly** : Responsive, mais focus desktop

---

## 🚀 Prochaine commande

Une fois checklist validée :

```bash
npm run dev    # Lancer le dev server
# Aller sur http://localhost:3000/admin/accounting/journal
# Tester : créer une écriture → vérifier dans Firestore
```

---

**Phase 2 démarrée ✅**

Journal page : page.tsx + 2 composants livrés  
Prêt pour Étape 2 (Rapprochement) 🎯

