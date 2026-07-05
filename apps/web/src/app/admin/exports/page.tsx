'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '@/lib/firebase';
import { METHOD_LABEL } from '@/lib/payment-constants';
import { genderLabel } from '@/lib/gender-constants';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeasonOption { id: string; label: string; isActive: boolean; startDate: string; endDate: string; }

type Granularity = 'dancer' | 'installment';

interface CategoryFlags {
  coordonnees: boolean;
  compteFamille: boolean;
  cotisation: boolean;
  echeances: boolean;
  annulationRemboursement: boolean;
  suiviBancaire: boolean;
  coursPresences: boolean;
}

interface InstallmentLite {
  id: string;
  amount: number;
  method: string;
  status: string;
  expectedDate: string;
  actualDate?: string;
  bankDepositId?: string;
  bankDeposit?: { depositDate: string; bankAccount: string };
}

interface PlanInfo {
  pricingPlanLabel: string;
  totalDue: number;
  totalPaid: number;
  paymentMethod: string;
  paymentPlanStatus: string;
  installments: InstallmentLite[];
  cancelledAt?: string;
  cancellationReason?: string;
  refundAmount?: number;
  refundMethod?: string;
}

interface DancerExportRow {
  dancerId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  memberNumber: string;
  roles: string[];
  isActive: boolean;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  accountEmail: string;
  accountDisplayName: string;
  otherDancerNames: string[];
  marketingConsent: boolean | undefined;
  imageRightsConsent: boolean | undefined;
  plan?: PlanInfo;
  courseNames: string[];
  attendanceCount: number;
  bankDepositRefs: { depositDate: string; bankAccount: string }[];
  chequesAwaitingCount: number;
  chequesAwaitingAmount: number;
}

function tsToIso(ts: any): string {
  if (!ts) return '';
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString().slice(0, 10);
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  return '';
}

function money(cents: number): number {
  return Math.round(cents) / 100;
}

const CATEGORY_SHORT_LABELS: Record<keyof CategoryFlags, string> = {
  coordonnees: 'coordonnees',
  compteFamille: 'famille',
  cotisation: 'cotisation',
  echeances: 'echeances',
  annulationRemboursement: 'annulation',
  suiviBancaire: 'bancaire',
  coursPresences: 'cours-presences',
};

function frenchTimestamp(d: Date): string {
  const date = d.toLocaleDateString('fr-FR').replace(/\//g, '-'); // 05-07-2026
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h'); // 14h32
  return `${date}_${time}`;
}

function buildExportFilename(
  seasonLabel: string, sheetName: string, categories: CategoryFlags, allDancers: boolean,
): string {
  const checkedLabels = (Object.keys(categories) as (keyof CategoryFlags)[])
    .filter(k => categories[k])
    .map(k => CATEGORY_SHORT_LABELS[k]);
  const parts = [
    'export',
    seasonLabel.replace(/\s+/g, '_'),
    sheetName.replace(/\s+/g, '_'),
    ...(allDancers ? ['tous-danseurs'] : []),
    ...checkedLabels,
    frenchTimestamp(new Date()),
  ];
  return `${parts.join('_')}.xlsx`;
}

export default function AdminExportsPage() {
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('dancer');
  const [allDancers, setAllDancers] = useState(false);
  const [categories, setCategories] = useState<CategoryFlags>({
    coordonnees: true,
    compteFamille: false,
    cotisation: true,
    echeances: false,
    annulationRemboursement: false,
    suiviBancaire: false,
    coursPresences: false,
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then(snap => {
      const list = snap.docs.map(d => ({
        id: d.id,
        label: d.data().label ?? d.id,
        isActive: d.data().isActive === true,
        startDate: tsToIso(d.data().startDate),
        endDate: tsToIso(d.data().endDate),
      }));
      setSeasons(list);
      const active = list.find(s => s.isActive) ?? list[0];
      if (active) setSelectedSeasonId(active.id);
    });
  }, []);

  const toggleCategory = (key: keyof CategoryFlags) => {
    setCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGenerate = async () => {
    if (!selectedSeasonId) return;
    setError(null);
    setGenerating(true);
    setLastCount(null);

    try {
      const season = seasons.find(s => s.id === selectedSeasonId);
      const seasonFilter = where('seasonId', '==', selectedSeasonId);

      const [membershipSnap, groupSnap, pricingSnap, accountSnap, dancerSnap, allDepositsSnap] = await Promise.all([
        getDocs(query(collection(db, 'memberships'), seasonFilter)),
        getDocs(query(collection(db, 'paymentGroups'), seasonFilter)),
        getDocs(query(collection(db, 'pricingPlans'), seasonFilter)),
        getDocs(collection(db, 'accounts')),
        getDocs(collection(db, 'dancers')),
        categories.suiviBancaire ? getDocs(collection(db, 'bankDeposits')) : Promise.resolve(null),
      ]);

      const dancerMap = new Map<string, any>();
      dancerSnap.docs.forEach(d => dancerMap.set(d.id, { id: d.id, ...d.data() }));
      const accountMap = new Map<string, any>();
      accountSnap.docs.forEach(d => accountMap.set(d.id, { id: d.id, ...d.data() }));
      const pricingLabels = new Map<string, string>();
      pricingSnap.docs.forEach(d => pricingLabels.set(d.id, d.data().label ?? d.id));

      const solo = membershipSnap.docs.map(d => ({ id: d.id, ...d.data() as any })).filter(m => !m.paymentGroupId);
      const groups = groupSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Résout, pour chaque danseur concerné, son plan (solo direct ou via groupe)
      const planByDancerId = new Map<string, { raw: any; installmentIds: string[] }>();
      solo.forEach(m => { if (m.dancerId) planByDancerId.set(m.dancerId, { raw: m, installmentIds: m.installmentIds ?? [] }); });
      for (const g of groups) {
        const memberIds: string[] = g.membershipIds ?? [];
        const memberSnaps = await Promise.all(memberIds.map((id: string) => getDoc(doc(db, 'memberships', id))));
        memberSnaps.forEach(s => {
          if (!s.exists()) return;
          const md = s.data();
          if (md.dancerId) planByDancerId.set(md.dancerId, { raw: { ...g, pricingPlanId: md.pricingPlanId }, installmentIds: g.installmentIds ?? [] });
        });
      }

      const bankDepositMap = new Map<string, { depositDate: string; bankAccount: string }>();
      if (allDepositsSnap) {
        allDepositsSnap.docs.forEach(d => {
          const data = d.data();
          (data.installmentIds ?? []).forEach((iid: string) => {
            bankDepositMap.set(iid, { depositDate: data.depositDate, bankAccount: data.bankAccount });
          });
        });
      }

      // Batch fetch de toutes les échéances nécessaires
      const allInstallmentIds = new Set<string>();
      planByDancerId.forEach(p => p.installmentIds.forEach(id => allInstallmentIds.add(id)));
      const instSnaps = await Promise.all([...allInstallmentIds].map(id => getDoc(doc(db, 'paymentInstallments', id))));
      const installmentMap = new Map<string, InstallmentLite>();
      instSnaps.forEach(s => {
        if (!s.exists()) return;
        const data = s.data();
        installmentMap.set(s.id, {
          id: s.id, amount: data.amount ?? 0, method: data.method, status: data.status,
          expectedDate: data.expectedDate ?? '', actualDate: data.actualDate, bankDepositId: data.bankDepositId,
          bankDeposit: data.bankDepositId ? bankDepositMap.get(data.bankDepositId) : undefined,
        });
      });

      // Cours & présences (uniquement si nécessaire)
      const courseNamesByDancer = new Map<string, string[]>();
      const attendanceCountByDancer = new Map<string, number>();
      if (categories.coursPresences) {
        const [regSnap, courseSnap, styleSnap, levelSnap] = await Promise.all([
          getDocs(query(collection(db, 'registrations'), seasonFilter, where('status', '==', 'active'))),
          getDocs(query(collection(db, 'courses'), seasonFilter)),
          getDocs(collection(db, 'danceStyles')),
          getDocs(collection(db, 'levels')),
        ]);
        const styleMap = new Map(styleSnap.docs.map(d => [d.id, d.data().name]));
        const levelMap = new Map(levelSnap.docs.map(d => [d.id, d.data().name]));
        const courseMap = new Map(courseSnap.docs.map(d => {
          const c = d.data();
          return [d.id, `${styleMap.get(c.danceStyleId) ?? ''} ${levelMap.get(c.levelId) ?? ''}`.trim()];
        }));
        regSnap.docs.forEach(d => {
          const reg = d.data();
          const accId = reg.userId as string;
          const acc = accountMap.get(accId);
          const dIds: string[] = acc?.dancerIds ?? [];
          const courseName = courseMap.get(reg.courseId) ?? '';
          dIds.forEach(did => {
            const list = courseNamesByDancer.get(did) ?? [];
            if (courseName && !list.includes(courseName)) list.push(courseName);
            courseNamesByDancer.set(did, list);
          });
        });

        if (season) {
          const attSnap = await getDocs(collection(db, 'attendances'));
          attSnap.docs.forEach(d => {
            const a = d.data();
            const date = a.date as string;
            if (date >= season.startDate && date <= season.endDate) {
              attendanceCountByDancer.set(a.dancerId, (attendanceCountByDancer.get(a.dancerId) ?? 0) + 1);
            }
          });
        }
      }

      // ── Assemblage des lignes ────────────────────────────────────────────
      // En mode "tous les danseurs", on part de TOUT le roster (indépendant de
      // la saison) ; sinon uniquement les danseurs ayant une cotisation cette
      // saison-là (comportement d'origine).
      const dancerIds = (granularity === 'dancer' && allDancers)
        ? [...dancerMap.keys()]
        : [...planByDancerId.keys()];

      const rows: DancerExportRow[] = [];
      dancerIds.forEach(dancerId => {
        const dancer = dancerMap.get(dancerId);
        if (!dancer) return;
        const planEntry = planByDancerId.get(dancerId);
        const account = accountMap.get(dancer.accountId);
        const otherDancerNames = ((account?.dancerIds ?? []) as string[])
          .filter(id => id !== dancerId)
          .map(id => dancerMap.get(id))
          .filter(Boolean)
          .map(d => `${d.firstName} ${d.lastName}`.trim());

        const installments = (planEntry?.installmentIds ?? [])
          .map(id => installmentMap.get(id))
          .filter((i): i is InstallmentLite => !!i);

        const plan: PlanInfo | undefined = planEntry ? {
          pricingPlanLabel: pricingLabels.get(planEntry.raw.pricingPlanId) ?? planEntry.raw.pricingPlanId ?? '',
          totalDue: planEntry.raw.totalDue ?? 0,
          totalPaid: planEntry.raw.totalPaid ?? 0,
          paymentMethod: planEntry.raw.paymentMethod ?? '',
          paymentPlanStatus: planEntry.raw.paymentPlanStatus ?? '',
          installments,
          cancelledAt: tsToIso(planEntry.raw.cancelledAt) || undefined,
          cancellationReason: planEntry.raw.cancellationReason,
          refundAmount: planEntry.raw.refundAmount,
          refundMethod: planEntry.raw.refundMethod,
        } : undefined;

        const chequesAwaiting = installments.filter(i => i.method === 'cheque' && i.status === 'paid' && !i.bankDepositId);
        const bankDepositRefs = installments
          .map(i => i.bankDepositId ? bankDepositMap.get(i.bankDepositId) : undefined)
          .filter((b): b is { depositDate: string; bankAccount: string } => !!b);

        rows.push({
          dancerId,
          firstName: dancer.firstName ?? '',
          lastName: dancer.lastName ?? '',
          birthDate: tsToIso(dancer.birthDate),
          gender: genderLabel(dancer.gender),
          memberNumber: dancer.memberNumber ?? '',
          roles: dancer.roles ?? [],
          isActive: dancer.isActive !== false,
          phone: dancer.phone ?? account?.phone ?? '',
          street: dancer.street ?? '',
          postalCode: dancer.postalCode ?? '',
          city: dancer.city ?? '',
          emergencyContactName: dancer.emergencyContact?.name ?? '',
          emergencyContactPhone: dancer.emergencyContact?.phone ?? '',
          accountEmail: account?.email ?? '',
          accountDisplayName: account?.displayName ?? '',
          otherDancerNames,
          marketingConsent: account?.marketingConsent,
          imageRightsConsent: account?.imageRightsConsent,
          plan,
          courseNames: courseNamesByDancer.get(dancerId) ?? [],
          attendanceCount: attendanceCountByDancer.get(dancerId) ?? 0,
          bankDepositRefs,
          chequesAwaitingCount: chequesAwaiting.length,
          chequesAwaitingAmount: chequesAwaiting.reduce((s, i) => s + i.amount, 0),
        });
      });

      rows.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

      const outRows = granularity === 'dancer' ? buildDancerRows(rows, categories) : buildInstallmentRows(rows, categories);

      if (outRows.length === 0) {
        setError("Aucune donnée à exporter pour cette saison avec les catégories sélectionnées.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const sheetName = granularity === 'dancer' ? 'Par danseur' : 'Par échéance';
      const filename = buildExportFilename(season?.label ?? selectedSeasonId, sheetName, categories, allDancers);
      const titleRow = filename.replace(/\.xlsx$/, '');
      const headers = Object.keys(outRows[0]!);
      const aoa = [
        [titleRow],
        headers,
        ...outRows.map(row => headers.map(h => row[h] ?? '')),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filename);
      setLastCount(outRows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la génération de l'export");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/payment-plans" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900">Export de données</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-6 max-w-2xl">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saison</label>
          <select value={selectedSeasonId} onChange={e => setSelectedSeasonId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Granularité</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" checked={granularity === 'dancer'} onChange={() => setGranularity('dancer')} />
              1 ligne par danseur
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" checked={granularity === 'installment'} onChange={() => setGranularity('installment')} />
              1 ligne par échéance
            </label>
          </div>
          {granularity === 'dancer' && (
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
              <input type="checkbox" checked={allDancers} onChange={e => setAllDancers(e.target.checked)} />
              Inclure tous les danseurs, même sans cotisation cette saison
            </label>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Données à inclure</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" checked disabled />
              Identité du danseur (toujours inclus)
            </label>
            <CategoryCheckbox label="Coordonnées (email, téléphone, adresse, contact urgence)" checked={categories.coordonnees} onChange={() => toggleCategory('coordonnees')} />
            <CategoryCheckbox label="Compte famille (autres danseurs, consentements)" checked={categories.compteFamille} onChange={() => toggleCategory('compteFamille')} />
            <CategoryCheckbox label="Cotisation (formule, montants, statut)" checked={categories.cotisation} onChange={() => toggleCategory('cotisation')} />
            <CategoryCheckbox label="Échéances (détail des paiements)" checked={categories.echeances} onChange={() => toggleCategory('echeances')} />
            <CategoryCheckbox label="Annulation & remboursement" checked={categories.annulationRemboursement} onChange={() => toggleCategory('annulationRemboursement')} />
            <CategoryCheckbox label="Suivi bancaire (chèques en attente, bordereaux)" checked={categories.suiviBancaire} onChange={() => toggleCategory('suiviBancaire')} />
            <CategoryCheckbox label="Cours & présences" checked={categories.coursPresences} onChange={() => toggleCategory('coursPresences')} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {lastCount !== null && !error && (
          <p className="text-sm text-green-600">Export généré — {lastCount} ligne(s).</p>
        )}

        <button onClick={handleGenerate} disabled={generating || !selectedSeasonId}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {generating ? 'Génération…' : 'Générer l\'export (Excel)'}
        </button>
      </div>
    </div>
  );
}

function CategoryCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

// ── Construction des lignes de sortie ──────────────────────────────────────────

function buildDancerRows(rows: DancerExportRow[], cat: CategoryFlags): Record<string, unknown>[] {
  return rows.map(r => {
    const out: Record<string, unknown> = {
      'Prénom': r.firstName,
      'Nom': r.lastName,
      'Date de naissance': r.birthDate,
      'Genre': r.gender,
      'N° adhérent': r.memberNumber,
      'Rôles': r.roles.join(', '),
      'Actif': r.isActive ? 'Oui' : 'Non',
    };
    if (cat.coordonnees) {
      out['Email'] = r.accountEmail;
      out['Téléphone'] = r.phone;
      out['Rue'] = r.street;
      out['Code postal'] = r.postalCode;
      out['Ville'] = r.city;
      out['Contact urgence (nom)'] = r.emergencyContactName;
      out['Contact urgence (tél.)'] = r.emergencyContactPhone;
    }
    if (cat.compteFamille) {
      out['Nom du compte'] = r.accountDisplayName;
      out['Autres danseurs du compte'] = r.otherDancerNames.join(', ');
      out['Consentement marketing'] = r.marketingConsent === undefined ? '' : (r.marketingConsent ? 'Oui' : 'Non');
      out["Consentement droit à l'image"] = r.imageRightsConsent === undefined ? '' : (r.imageRightsConsent ? 'Oui' : 'Non');
    }
    if (cat.cotisation) {
      out['Formule'] = r.plan?.pricingPlanLabel ?? '';
      out['Montant dû'] = r.plan ? money(r.plan.totalDue) : '';
      out['Montant payé'] = r.plan ? money(r.plan.totalPaid) : '';
      out['Reste à payer'] = r.plan ? money(r.plan.totalDue - r.plan.totalPaid) : '';
      out['Mode de paiement'] = r.plan ? (METHOD_LABEL as Record<string, string>)[r.plan.paymentMethod] ?? r.plan.paymentMethod : '';
      out['Statut du plan'] = r.plan?.paymentPlanStatus ?? '';
    }
    if (cat.echeances) {
      out["Nombre d'échéances"] = r.plan?.installments.length ?? 0;
      out['Détail des échéances'] = (r.plan?.installments ?? [])
        .map(i => `${i.expectedDate}: ${money(i.amount)}€ (${i.status})`)
        .join(' | ');
    }
    if (cat.annulationRemboursement) {
      out['Annulé'] = r.plan?.cancelledAt ? 'Oui' : 'Non';
      out["Date d'annulation"] = r.plan?.cancelledAt ?? '';
      out["Motif d'annulation"] = r.plan?.cancellationReason ?? '';
      out['Montant remboursé'] = r.plan?.refundAmount ? money(r.plan.refundAmount) : '';
      out['Mode de remboursement'] = r.plan?.refundMethod ? (METHOD_LABEL as Record<string, string>)[r.plan.refundMethod] ?? r.plan.refundMethod : '';
    }
    if (cat.suiviBancaire) {
      out['Chèques en attente de dépôt'] = r.chequesAwaitingCount;
      out['Montant en attente de dépôt'] = money(r.chequesAwaitingAmount);
      out['Bordereaux associés'] = [...new Set(r.bankDepositRefs.map(b => `${b.depositDate} (${b.bankAccount})`))].join(' | ');
    }
    if (cat.coursPresences) {
      out['Cours inscrits'] = r.courseNames.join(', ');
      out['Nombre de présences'] = r.attendanceCount;
    }
    return out;
  });
}

function buildInstallmentRows(rows: DancerExportRow[], cat: CategoryFlags): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  rows.forEach(r => {
    const installments = r.plan?.installments ?? [];
    if (installments.length === 0) return;
    installments.forEach(inst => {
      const line: Record<string, unknown> = {
        'Prénom': r.firstName,
        'Nom': r.lastName,
        'Date de naissance': r.birthDate,
        'Genre': r.gender,
        'N° adhérent': r.memberNumber,
        'Rôles': r.roles.join(', '),
        'Actif': r.isActive ? 'Oui' : 'Non',
      };
      if (cat.coordonnees) {
        line['Email'] = r.accountEmail;
        line['Téléphone'] = r.phone;
        line['Rue'] = r.street;
        line['Code postal'] = r.postalCode;
        line['Ville'] = r.city;
        line['Contact urgence (nom)'] = r.emergencyContactName;
        line['Contact urgence (tél.)'] = r.emergencyContactPhone;
      }
      if (cat.compteFamille) {
        line['Nom du compte'] = r.accountDisplayName;
        line['Autres danseurs du compte'] = r.otherDancerNames.join(', ');
        line['Consentement marketing'] = r.marketingConsent === undefined ? '' : (r.marketingConsent ? 'Oui' : 'Non');
        line["Consentement droit à l'image"] = r.imageRightsConsent === undefined ? '' : (r.imageRightsConsent ? 'Oui' : 'Non');
      }
      if (cat.cotisation) {
        line['Formule'] = r.plan?.pricingPlanLabel ?? '';
        line['Statut du plan'] = r.plan?.paymentPlanStatus ?? '';
      }
      line['Date prévue'] = inst.expectedDate;
      line['Date réelle'] = inst.actualDate ?? '';
      line['Montant'] = money(inst.amount);
      line['Mode'] = (METHOD_LABEL as Record<string, string>)[inst.method] ?? inst.method;
      line['Statut échéance'] = inst.status;
      if (cat.annulationRemboursement) {
        line['Annulé'] = r.plan?.cancelledAt ? 'Oui' : 'Non';
        line["Date d'annulation"] = r.plan?.cancelledAt ?? '';
        line["Motif d'annulation"] = r.plan?.cancellationReason ?? '';
        line['Montant remboursé'] = r.plan?.refundAmount ? money(r.plan.refundAmount) : '';
        line['Mode de remboursement'] = r.plan?.refundMethod ? (METHOD_LABEL as Record<string, string>)[r.plan.refundMethod] ?? r.plan.refundMethod : '';
      }
      if (cat.suiviBancaire) {
        line['En attente de dépôt'] = (inst.method === 'cheque' && inst.status === 'paid' && !inst.bankDepositId) ? 'Oui' : 'Non';
        line['Date de dépôt'] = inst.bankDeposit?.depositDate ?? '';
        line['Compte bancaire'] = inst.bankDeposit?.bankAccount ?? '';
      }
      if (cat.coursPresences) {
        line['Cours inscrits'] = r.courseNames.join(', ');
        line['Nombre de présences (saison)'] = r.attendanceCount;
      }
      out.push(line);
    });
  });
  return out;
}
