'use client';

import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ProfileFieldsConfig, CustomField, RoleConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

function mergeWithDefaults(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const result = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
      if (saved[key]) result[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return result;
}

interface Dancer {
  id: string;
  firstName: string;
  lastName: string;
  accountId: string;
  roles: string[];
  isActive: boolean;
  phone?: string;
  address?: string;
  birthDate?: any;
  isMinor?: boolean;
  memberNumber?: string;
  emergencyContact?: { name?: string; phone?: string };
  photoUrl?: string;
  gender?: string;
  profession?: string;
  medicalNotes?: string;
  healthCertificate?: boolean;
  customFields?: Record<string, unknown>;
}
interface Account {
  id: string;
  email: string;
  displayName: string;
  dancerIds: string[];
  roles?: string[];
  phone?: string;
}
interface Installment { id: string; expectedDate: string; amount: number; status: string; method?: string; chequeNumber?: string; draweeBank?: string; draweeCity?: string; }
interface Entry {
  id: string;
  kind: 'solo' | 'group';
  seasonLabel: string;
  seasonId: string;
  planLabel: string;
  paymentMethod: string;
  totalDue: number;
  totalPaid: number;
  status: string;
  installmentIds: string[];
  installments: Installment[];
  groupDancerNames: string[];
}
interface CourseRow {
  registrationId: string;
  registrationStatus: string;
  seasonId: string;
  seasonLabel: string;
  danceStyleLabel: string;
  levelLabel: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseName?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', approved: 'Approuvé', active: 'Actif',
  rejected: 'Rejeté', cancelled: 'Annulé',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700', approved: 'bg-green-100 text-green-700',
  active: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};
const REG_STATUS_LABEL: Record<string, string> = {
  active: 'Inscrit', cancelled: 'Annulé', waitlist: 'Liste d\'attente',
};
const REG_STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  waitlist: 'bg-orange-100 text-orange-700',
};
const METHOD_LABEL: Record<string, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces', online: 'En ligne',
};
const DAY_LABEL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function formatDate(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('fr-FR');
  } catch { return ''; }
}

function DisabledBadge() {
  return (
    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
      Champ désactivé
    </span>
  );
}

function InfoRow({ label, value, disabled }: { label: string; value?: string | null; disabled?: boolean }) {
  if (!value && !disabled) return null;
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        {label}{disabled && <DisabledBadge />}
      </p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

export default function DancerDetailPage() {
  const { dancerId } = useParams<{ dancerId: string }>();
  const [dancer, setDancer] = useState<Dancer | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldConfig, setFieldConfig] = useState<ProfileFieldsConfig>(DEFAULT_PROFILE_FIELDS);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [editingRoles, setEditingRoles] = useState(false);
  const [pendingRoles, setPendingRoles] = useState<string[]>([]);
  const [pendingActive, setPendingActive] = useState(true);
  const [savingRoles, setSavingRoles] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleConfig[]>([]);

  const handleSaveRoles = async () => {
    if (!dancerId || !dancer) return;
    setSavingRoles(true);
    await updateDoc(doc(db, 'dancers', dancerId), { roles: pendingRoles, isActive: pendingActive });

    // Sync account.roles: admin/bureau depuis le dancer vers le compte
    if (dancer.accountId) {
      const ACCOUNT_ROLES = ['admin', 'bureau'];
      const newAccountRoles = pendingRoles.filter(r => ACCOUNT_ROLES.includes(r));
      // On ne retire pas les rôles compte si un autre dancer du même compte les possède
      const currentAccountRoles: string[] = account?.roles ?? [];
      const merged = [...new Set([
        ...currentAccountRoles.filter(r => !ACCOUNT_ROLES.includes(r)), // autres rôles intacts
        ...newAccountRoles,
      ])];
      await updateDoc(doc(db, 'accounts', dancer.accountId), { roles: merged });
    }

    setDancer(prev => prev ? { ...prev, roles: pendingRoles, isActive: pendingActive } : prev);
    setSavingRoles(false);
    setEditingRoles(false);
  };

  useEffect(() => {
    if (!dancerId) return;
    (async () => {
      setLoading(true);
      try {
        const [dancerSnap, settingsSnap, rolesSnap] = await Promise.all([
          getDoc(doc(db, 'dancers', dancerId)),
          getDoc(doc(db, 'appSettings', 'main')),
          getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))),
        ]);
        setAllRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig)));
        if (settingsSnap.exists()) setFieldConfig(mergeWithDefaults(settingsSnap.data().profileFields));

        // Charge les champs custom
        const schemaSnap = await getDocs(
          query(collection(db, 'profileSchemas'), where('isActive', '==', true), limit(1))
        );
        if (!schemaSnap.empty) {
          const sid = schemaSnap.docs[0].id;
          const cfSnap = await getDocs(
            query(collection(db, 'profileSchemas', sid, 'fields'), orderBy('displayOrder'))
          );
          setCustomFields(cfSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomField)));
        }
        if (!dancerSnap.exists()) return;
        const d = dancerSnap.data();
        const dancerData: Dancer = {
          id: dancerSnap.id,
          firstName: d.firstName ?? '',
          lastName: d.lastName ?? '',
          accountId: d.accountId ?? '',
          roles: d.roles ?? [],
          isActive: d.isActive !== false,
          phone: d.phone,
          address: d.address,
          birthDate: d.birthDate,
          isMinor: d.isMinor,
          memberNumber: d.memberNumber,
          emergencyContact: d.emergencyContact,
          photoUrl: d.photoUrl,
          gender: d.gender,
          profession: d.profession,
          medicalNotes: d.medicalNotes,
          healthCertificate: d.healthCertificate,
          customFields: d.customFields,
        };
        setDancer(dancerData);

        const accountSnap = await getDoc(doc(db, 'accounts', dancerData.accountId));
        const accountData: Account | null = accountSnap.exists() ? {
          id: accountSnap.id,
          email: accountSnap.data().email ?? '',
          displayName: accountSnap.data().displayName ?? '',
          dancerIds: accountSnap.data().dancerIds ?? [],
          phone: accountSnap.data().phone,
        } : null;
        setAccount(accountData);

        const [membershipSnap, groupSnap, seasonSnap, planSnap, allDancerSnap, regSnap, styleSnap, levelSnap] = await Promise.all([
          getDocs(query(collection(db, 'memberships'), where('userId', '==', dancerData.accountId))),
          getDocs(query(collection(db, 'paymentGroups'), where('userId', '==', dancerData.accountId))),
          getDocs(collection(db, 'seasons')),
          getDocs(collection(db, 'pricingPlans')),
          getDocs(collection(db, 'dancers')),
          getDocs(query(collection(db, 'registrations'), where('userId', '==', dancerData.accountId))),
          getDocs(collection(db, 'danceStyles')),
          getDocs(collection(db, 'levels')),
        ]);

        const seasonLabelMap = new Map<string, string>();
        seasonSnap.docs.forEach(s => seasonLabelMap.set(s.id, s.data().label ?? s.id));

        const planLabelMap = new Map<string, string>();
        planSnap.docs.forEach(p => planLabelMap.set(p.id, p.data().label ?? p.data().name ?? ''));

        const dancerNameMap = new Map<string, string>();
        allDancerSnap.docs.forEach(d => {
          dancerNameMap.set(d.id, `${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`.trim());
        });

        const styleLabelMap = new Map<string, string>();
        styleSnap.docs.forEach(d => styleLabelMap.set(d.id, d.data().name ?? d.data().label ?? ''));

        const levelLabelMap = new Map<string, string>();
        levelSnap.docs.forEach(d => levelLabelMap.set(d.id, d.data().name ?? d.data().label ?? ''));

        const membershipById = new Map<string, any>();
        membershipSnap.docs.forEach(d => membershipById.set(d.id, { id: d.id, ...d.data() }));

        const isThisDancer = (m: any): boolean => {
          if (m.dancerId) return m.dancerId === dancerId;
          return accountData?.dancerIds?.[0] === dancerId;
        };

        // ── Cotisations ────────────────────────────────────────────────
        const allEntries: Entry[] = [];

        membershipSnap.docs.forEach(d => {
          const m = { id: d.id, ...d.data() } as any;
          if (m.paymentGroupId) return;
          if (!isThisDancer(m)) return;
          allEntries.push({
            id: m.id, kind: 'solo',
            seasonId: m.seasonId ?? '',
            seasonLabel: seasonLabelMap.get(m.seasonId) ?? m.seasonId,
            planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
            paymentMethod: m.paymentMethod ?? '',
            totalDue: m.totalDue ?? 0, totalPaid: m.totalPaid ?? 0,
            status: m.paymentPlanStatus ?? '',
            installmentIds: m.installmentIds ?? [], installments: [], groupDancerNames: [],
          });
        });

        for (const d of groupSnap.docs) {
          const g = { id: d.id, ...d.data() } as any;
          const membershipIds: string[] = g.membershipIds ?? [];
          const myMembership = membershipIds.map(id => membershipById.get(id)).filter(Boolean).find(m => isThisDancer(m));
          if (!myMembership) continue;
          const otherDancerNames = (accountData?.dancerIds ?? [])
            .filter(id => id !== dancerId)
            .map(id => dancerNameMap.get(id) ?? '').filter(Boolean);
          allEntries.push({
            id: g.id, kind: 'group',
            seasonId: g.seasonId ?? '',
            seasonLabel: seasonLabelMap.get(g.seasonId) ?? g.seasonId,
            planLabel: planLabelMap.get(myMembership.pricingPlanId) ?? '',
            paymentMethod: g.paymentMethod ?? '',
            totalDue: g.totalDue ?? 0, totalPaid: g.totalPaid ?? 0,
            status: g.paymentPlanStatus ?? '',
            installmentIds: g.installmentIds ?? [], installments: [],
            groupDancerNames: otherDancerNames,
          });
        }

        allEntries.sort((a, b) => b.seasonId.localeCompare(a.seasonId));

        await Promise.all(allEntries.map(async entry => {
          if (entry.installmentIds.length === 0) return;
          const insts = await Promise.all(
            entry.installmentIds.map(async id => {
              const snap = await getDoc(doc(db, 'paymentInstallments', id));
              if (!snap.exists()) return null;
              const sd = snap.data();
              return { id, expectedDate: sd.expectedDate ?? '', amount: sd.amount ?? 0, status: sd.status ?? 'pending', method: sd.method ?? undefined, chequeNumber: sd.chequeNumber ?? undefined, draweeBank: sd.draweeBank ?? undefined, draweeCity: sd.draweeCity ?? undefined };
            })
          );
          entry.installments = insts.filter(Boolean) as Installment[];
        }));

        setEntries(allEntries);

        // ── Inscriptions ───────────────────────────────────────────────
        const uniqueCourseIds = [...new Set(regSnap.docs.map(d => d.data().courseId).filter(Boolean))];
        const courseSnaps = await Promise.all(uniqueCourseIds.map(id => getDoc(doc(db, 'courses', id))));
        const courseMap = new Map<string, any>();
        courseSnaps.forEach(s => { if (s.exists()) courseMap.set(s.id, s.data()); });

        const courseRows: CourseRow[] = regSnap.docs
          .map(d => {
            const r = d.data();
            const c = courseMap.get(r.courseId);
            return {
              registrationId: d.id,
              registrationStatus: r.status ?? 'active',
              seasonId: r.seasonId ?? '',
              seasonLabel: seasonLabelMap.get(r.seasonId) ?? r.seasonId ?? '',
              danceStyleLabel: c ? (styleLabelMap.get(c.danceStyleId) ?? '') : '',
              levelLabel: c ? (levelLabelMap.get(c.levelId) ?? '') : '',
              dayOfWeek: c?.dayOfWeek ?? 0,
              startTime: c?.startTime ?? '',
              endTime: c?.endTime ?? '',
              courseName: c?.name,
            };
          })
          .filter(r => r.registrationStatus !== 'cancelled')
          .sort((a, b) => b.seasonId.localeCompare(a.seasonId));

        setCourses(courseRows);
      } finally {
        setLoading(false);
      }
    })();
  }, [dancerId]);

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>;
  if (!dancer) return <div className="text-center py-12 text-gray-400 text-sm">Danseur introuvable.</div>;

  const phone = dancer.phone || account?.phone;

  // Group courses by season
  const coursesBySeason = courses.reduce<Record<string, CourseRow[]>>((acc, r) => {
    if (!acc[r.seasonId]) acc[r.seasonId] = [];
    acc[r.seasonId].push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dancers" className="text-sm text-gray-400 hover:text-gray-700">← Danseurs</Link>
        <h1 className="text-2xl font-bold text-gray-900">{dancer.firstName} {dancer.lastName}</h1>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0">
              {dancer.photoUrl
                ? <img src={dancer.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                : <span className="text-blue-700 font-bold text-xl">{dancer.firstName[0]}{dancer.lastName[0]}</span>
              }
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">{dancer.firstName} {dancer.lastName}</p>
              {dancer.memberNumber && (
                <p className="text-xs text-gray-400 mt-0.5">N° {dancer.memberNumber}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dancer.isMinor && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Mineur</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="Email" value={account?.email} />
          <InfoRow label="Téléphone" value={phone} disabled={!fieldConfig.phone.enabled && !!phone} />
          <InfoRow label="Date de naissance" value={formatDate(dancer.birthDate)} disabled={!fieldConfig.birthDate.enabled && !!dancer.birthDate} />
          <InfoRow label="Genre" value={dancer.gender} disabled={!fieldConfig.gender.enabled && !!dancer.gender} />
          <InfoRow label="Adresse" value={dancer.address} disabled={!fieldConfig.address.enabled && !!dancer.address} />
          <InfoRow label="Profession" value={dancer.profession} disabled={!fieldConfig.profession.enabled && !!dancer.profession} />
          <InfoRow label="Notes médicales" value={dancer.medicalNotes} disabled={!fieldConfig.medicalNotes.enabled && !!dancer.medicalNotes} />
          <div className="col-span-2 sm:col-span-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Rôles & statut</p>
              {!editingRoles ? (
                <button onClick={() => { setPendingRoles(dancer.roles); setPendingActive(dancer.isActive); setEditingRoles(true); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">Modifier</button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSaveRoles} disabled={savingRoles}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {savingRoles ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                  <button onClick={() => setEditingRoles(false)}
                    className="text-xs text-gray-500 hover:text-gray-700">Annuler</button>
                </div>
              )}
            </div>
            {!editingRoles ? (
              <div className="flex gap-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dancer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {dancer.isActive ? 'Actif' : 'Inactif'}
                </span>
                {dancer.roles.map(r => {
                  const label = allRoles.find(x => x.key === r)?.label ?? r;
                  return <span key={r} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{label}</span>;
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={pendingActive} onChange={e => setPendingActive(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">Compte actif</span>
                </label>
                <div className="border-t border-gray-100 pt-2 grid grid-cols-2 gap-2">
                  {allRoles.map(role => (
                    <label key={role.key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={pendingRoles.includes(role.key)}
                        onChange={e => setPendingRoles(prev =>
                          e.target.checked ? [...prev, role.key] : prev.filter(r => r !== role.key)
                        )}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm text-gray-700">{role.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {dancer.emergencyContact && (dancer.emergencyContact.name || dancer.emergencyContact.phone) && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center">
              Contact d'urgence
              {!fieldConfig.emergencyContact.enabled && <DisabledBadge />}
            </p>
            <div className="flex gap-6">
              <InfoRow label="Nom" value={dancer.emergencyContact.name} />
              <InfoRow label="Téléphone" value={dancer.emergencyContact.phone} />
            </div>
          </div>
        )}
        {dancer.healthCertificate && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center">
              Certificat médical
              {!fieldConfig.healthCertificate.enabled && <DisabledBadge />}
            </p>
            <p className="text-sm text-green-700">Fourni</p>
          </div>
        )}
      </div>

      {/* Inscriptions aux cours */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        Cours
        {account && account.dancerIds.length > 1 && (
          <span className="ml-2 text-xs font-normal text-gray-400">(ensemble du compte)</span>
        )}
      </h2>

      {Object.keys(coursesBySeason).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-400 mb-6">
          Aucune inscription active.
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {Object.entries(coursesBySeason).map(([seasonId, rows]) => (
            <div key={seasonId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                {rows[0]?.seasonLabel || seasonId}
              </p>
              <div className="space-y-2">
                {rows.map(r => (
                  <div key={r.registrationId} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {r.danceStyleLabel || r.courseName || '—'}
                        {r.levelLabel && <span className="text-gray-400 font-normal"> · {r.levelLabel}</span>}
                      </p>
                      {(r.dayOfWeek !== undefined || r.startTime) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {DAY_LABEL[r.dayOfWeek]} {r.startTime}{r.endTime && `–${r.endTime}`}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REG_STATUS_COLOR[r.registrationStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                      {REG_STATUS_LABEL[r.registrationStatus] ?? r.registrationStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cotisations */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">Cotisations</h2>

      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
          Aucune cotisation enregistrée.
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{entry.seasonLabel}</p>
                    {entry.kind === 'group' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Groupe</span>
                    )}
                  </div>
                  {entry.kind === 'group' && entry.groupDancerNames.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">Avec : {entry.groupDancerNames.join(', ')}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[entry.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[entry.status] ?? entry.status}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {entry.planLabel && (
                  <div>
                    <p className="text-xs text-gray-400">Plan</p>
                    <p className="text-sm font-medium text-gray-800">{entry.planLabel}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">Mode de paiement</p>
                  <p className="text-sm font-medium text-gray-800">{METHOD_LABEL[entry.paymentMethod] ?? (entry.paymentMethod || '—')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total dû</p>
                  <p className="text-sm font-semibold text-gray-900">{(entry.totalDue / 100).toFixed(2)} €</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total encaissé</p>
                  <p className={`text-sm font-semibold ${entry.totalPaid >= entry.totalDue ? 'text-green-700' : 'text-gray-900'}`}>
                    {(entry.totalPaid / 100).toFixed(2)} €
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                {entry.installments.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Versements</p>
                    <div className="space-y-2">
                      {entry.installments.map((inst, idx) => (
                        <div key={inst.id} className="py-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                              <span className="text-sm text-gray-700">
                                {inst.expectedDate ? new Date(inst.expectedDate + 'T12:00:00').toLocaleDateString('fr-FR') : inst.expectedDate}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inst.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                {inst.status === 'paid' ? 'Encaissé' : 'En attente'}
                              </span>
                              <span className="text-sm font-medium text-gray-800 w-20 text-right">
                                {(inst.amount / 100).toFixed(2)} €
                              </span>
                            </div>
                          </div>
                          {inst.method === 'cheque' && (inst.chequeNumber || inst.draweeBank || inst.draweeCity) && (
                            <p className="text-xs text-gray-400 ml-8 mt-0.5">
                              {[
                                inst.chequeNumber ? `N° ${inst.chequeNumber}` : null,
                                inst.draweeBank,
                                inst.draweeCity,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">Aucun versement planifié.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Champs personnalisés */}
      {customFields.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-gray-900 mt-6 mb-3">Informations complémentaires</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {(() => {
              const dancerCustom = dancer.customFields ?? {};
              const byCategory = customFields.reduce<Record<string, CustomField[]>>((acc, f) => {
                const cat = f.category ?? '';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(f);
                return acc;
              }, {});

              return Object.entries(byCategory).map(([cat, fields]) => (
                <div key={cat} className="mb-4 last:mb-0">
                  {cat && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{cat}</p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {fields.map(field => {
                      const val = dancerCustom[field.key];
                      const hasValue = val !== undefined && val !== null && val !== '' &&
                        !(Array.isArray(val) && val.length === 0);
                      if (!hasValue) return (
                        <div key={field.id}>
                          <p className="text-xs text-gray-400">{field.label}</p>
                          <p className="text-sm text-gray-300">—</p>
                        </div>
                      );
                      return (
                        <div key={field.id}>
                          <p className="text-xs text-gray-400">{field.label}</p>
                          {field.type === 'checkbox' ? (
                            <p className="text-sm text-gray-800">{val ? '✓ Oui' : '✗ Non'}</p>
                          ) : field.type === 'multiselect' ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {(val as string[]).map(v => (
                                <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{v}</span>
                              ))}
                            </div>
                          ) : field.type === 'file' ? (
                            <a href={val as string} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800">
                              Voir le fichier ↗
                            </a>
                          ) : (
                            <p className="text-sm text-gray-800">{String(val)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
