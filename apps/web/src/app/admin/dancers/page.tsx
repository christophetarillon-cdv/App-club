'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, orderBy,
  doc, getDoc, updateDoc, writeBatch, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface RemovalRequest {
  id: string;
  dancerId: string;
  dancerName: string;
  accountId: string;
  accountEmail: string;
  status?: string;
  reason?: string;
  reviewedAt?: { seconds: number };
}

const REMOVAL_STATUS_LABEL: Record<string, string> = {
  approved: 'Retrait validé',
  rejected: 'Refusé',
  'auto-approved': 'Compte supprimé par l’adhérent',
};

interface Season { id: string; label: string; startDate: string; isActive: boolean; }
interface Account { id: string; dancerIds: string[]; }
interface RoleOption { key: string; label: string; }

interface MembershipInfo {
  planLabel: string;
  paymentMethod: string;
  totalDue: number;
  status: string;
  isGroup: boolean;
}

interface DancerRow {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  roles: string[];
  isActive: boolean;
  isDeleted: boolean;
  isDetached: boolean;
  info?: MembershipInfo;
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
const METHOD_LABEL: Record<string, string> = {
  cheque: 'Chèque', transfer: 'Virement', cash: 'Espèces', online: 'En ligne',
};

export default function AdminDancersPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const [removalHistory, setRemovalHistory] = useState<RemovalRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState('');
  const [rows, setRows] = useState<DancerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'seasons')).then(snap => {
      const s = snap.docs.map(d => ({
        id: d.id,
        label: d.data().label ?? d.id,
        startDate: d.data().startDate ?? '',
        isActive: d.data().isActive === true,
      }));
      s.sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')));
      setSeasons(s);
      const active = s.find(s => s.isActive);
      setSelectedSeasonId(active ? active.id : (s[0]?.id ?? ''));
    });
    getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))).then(snap => {
      setRoleOptions(snap.docs.map(d => ({ key: d.data().key ?? d.id, label: d.data().label ?? d.id })));
    });
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    setLoading(true);

    Promise.all([
      getDocs(collection(db, 'dancers')),
      getDocs(collection(db, 'accounts')),
      getDocs(query(collection(db, 'memberships'), where('seasonId', '==', selectedSeasonId))),
      getDocs(query(collection(db, 'paymentGroups'), where('seasonId', '==', selectedSeasonId))),
      getDocs(collection(db, 'pricingPlans')),
    ]).then(([dancerSnap, accountSnap, membershipSnap, groupSnap, planSnap]) => {
      const accountMap = new Map<string, Account>();
      accountSnap.docs.forEach(d => {
        accountMap.set(d.id, { id: d.id, dancerIds: d.data().dancerIds ?? [] });
      });

      const planLabelMap = new Map<string, string>();
      planSnap.docs.forEach(d => {
        planLabelMap.set(d.id, d.data().label ?? d.data().name ?? '');
      });

      const membershipById = new Map<string, any>();
      membershipSnap.docs.forEach(d => membershipById.set(d.id, { id: d.id, ...d.data() }));

      const infoByDancer = new Map<string, MembershipInfo>();

      // Solo memberships
      membershipSnap.docs.forEach(d => {
        const m = d.data();
        if (m.paymentGroupId) return;
        let did: string | undefined = m.dancerId;
        if (!did) did = accountMap.get(m.userId)?.dancerIds?.[0];
        if (did && !infoByDancer.has(did)) {
          infoByDancer.set(did, {
            planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
            paymentMethod: m.paymentMethod ?? '',
            totalDue: m.totalDue ?? 0,
            status: m.paymentPlanStatus ?? '',
            isGroup: false,
          });
        }
      });

      // Group memberships
      groupSnap.docs.forEach(d => {
        const g = d.data();
        (g.membershipIds as string[] ?? []).forEach((mId: string) => {
          const m = membershipById.get(mId);
          if (!m) return;
          let did: string | undefined = m.dancerId;
          if (!did) did = accountMap.get(m.userId)?.dancerIds?.[0];
          if (did && !infoByDancer.has(did)) {
            infoByDancer.set(did, {
              planLabel: planLabelMap.get(m.pricingPlanId) ?? '',
              paymentMethod: g.paymentMethod ?? '',
              totalDue: m.totalDue ?? 0,
              status: g.paymentPlanStatus ?? '',
              isGroup: true,
            });
          }
        });
      });

      const dancers: DancerRow[] = dancerSnap.docs.map(d => ({
        id: d.id,
        firstName: d.data().firstName ?? '',
        lastName: d.data().lastName ?? '',
        photoUrl: d.data().photoUrl,
        roles: d.data().roles ?? [],
        isActive: d.data().isActive !== false,
        isDeleted: d.data().isDeleted === true,
        // Detache : plus rattache a aucun compte (retrait valide). La fiche et
        // l'historique sont intacts, mais la personne ne peut plus se connecter.
        isDetached: !d.data().accountId,
        info: infoByDancer.get(d.id),
      }));
      dancers.sort((a, b) =>
        a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
      );

      setRows(dancers);
    }).finally(() => setLoading(false));
  }, [selectedSeasonId]);

  const deletedCount = rows.filter(r => r.isDeleted).length;

  const filtered = rows
    // Les fiches supprimées (anonymisées) sont conservées pour la comptabilité
    // mais polluent la liste courante : masquées par défaut.
    .filter(r => showDeleted || !r.isDeleted)
    .filter(r => {
      if (search.trim().length < 1) return true;
      const q = search.toLowerCase();
      return r.firstName.toLowerCase().includes(q) || r.lastName.toLowerCase().includes(q);
    })
    .filter(r => !selectedRole || r.roles.includes(selectedRole))
    .filter(r => !selectedStatus || (selectedStatus === 'none' ? !r.info : r.info?.status === selectedStatus));

  // Demandes de retrait deposees depuis l'app mobile. Le titulaire ne detache
  // pas lui-meme : le detachement n'a lieu qu'ici, a la validation.
  const loadRemovalRequests = async () => {
    // Une seule lecture pour les deux usages : le bandeau à valider (pending)
    // et l'historique des départs (tout le reste, y compris les suppressions
    // de compte journalisées par la Cloud Function en 'auto-approved').
    const snap = await getDocs(collection(db, 'dancerRemovalRequests'));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as RemovalRequest));
    setRemovalRequests(all.filter(r => r.status === 'pending'));
    setRemovalHistory(
      all
        .filter(r => r.status && r.status !== 'pending')
        .sort((a, b) => (b.reviewedAt?.seconds ?? 0) - (a.reviewedAt?.seconds ?? 0)),
    );
  };

  useEffect(() => {
    loadRemovalRequests().catch(e => console.error('removal requests load failed', e));
  }, []);

  const handleApproveRemoval = async (req: RemovalRequest) => {
    if (processingRequestId) return;
    // Relecture du compte au moment de la validation : la composition a pu
    // changer depuis le dépôt de la demande (danseur ajouté ou déjà retiré).
    const accSnap = await getDoc(doc(db, 'accounts', req.accountId));
    const accDancerIds: string[] = accSnap.data()?.dancerIds ?? [];
    if (accDancerIds.length <= 1) {
      setRequestError(`${req.dancerName} est le seul danseur du compte ${req.accountEmail} : le compte n'aurait plus aucun danseur.`);
      return;
    }
    if (!confirm(
      `Valider le retrait de ${req.dancerName} du compte ${req.accountEmail} ?\n\n` +
      `La fiche et tout l'historique sont conservés, seul le rattachement au compte est défait.`
    )) return;

    setProcessingRequestId(req.id);
    setRequestError('');
    try {
      // writeBatch : les trois documents doivent bouger ensemble, sinon le
      // compte resterait incohérent (rattachement à moitié défait).
      const batch = writeBatch(db);
      batch.update(doc(db, 'accounts', req.accountId), { dancerIds: arrayRemove(req.dancerId) });
      batch.update(doc(db, 'dancers', req.dancerId), {
        accountId: '',
        detachedAt: serverTimestamp(),
        detachedFromAccountId: req.accountId,
      });
      batch.update(doc(db, 'dancerRemovalRequests', req.id), {
        status: 'approved',
        reviewedAt: serverTimestamp(),
      });
      await batch.commit();
      await loadRemovalRequests();
    } catch (error) {
      console.error('approve removal failed', error);
      setRequestError('La validation a échoué. Vérifiez votre connexion et réessayez.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRemoval = async (req: RemovalRequest) => {
    if (processingRequestId) return;
    if (!confirm(`Refuser la demande de retrait de ${req.dancerName} ?`)) return;
    setProcessingRequestId(req.id);
    setRequestError('');
    try {
      await updateDoc(doc(db, 'dancerRemovalRequests', req.id), {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
      });
      await loadRemovalRequests();
    } catch (error) {
      console.error('reject removal failed', error);
      setRequestError('Le refus a échoué. Vérifiez votre connexion et réessayez.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleExport = () => {
    const seasonLabel = seasons.find(s => s.id === selectedSeasonId)?.label ?? selectedSeasonId;
    const roleLabel = (key: string) => roleOptions.find(r => r.key === key)?.label ?? key;

    const data = filtered.map(row => ({
      'Nom': row.lastName,
      'Prénom': row.firstName,
      'Rôles': row.roles.map(roleLabel).join(', '),
      'Actif': row.isActive ? 'Oui' : 'Non',
      'Plan': row.info?.planLabel ?? '',
      'Méthode de paiement': row.info?.paymentMethod ? (METHOD_LABEL[row.info.paymentMethod] ?? row.info.paymentMethod) : '',
      'Montant dû (€)': row.info ? (row.info.totalDue / 100).toFixed(2) : '',
      'Statut cotisation': row.info ? (STATUS_LABEL[row.info.status] ?? row.info.status) : 'Sans cotisation',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 8 },
      { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danseurs');
    XLSX.writeFile(wb, `danseurs_${seasonLabel.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900">Danseurs</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
        >
          Exporter Excel
        </button>
      </div>

      {removalRequests.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-amber-900 mb-1">
            Demandes de retrait à valider ({removalRequests.length})
          </h2>
          <p className="text-xs text-amber-800 mb-3">
            Déposées depuis l&apos;application. Le danseur reste rattaché tant que la demande n&apos;est pas validée ;
            son historique est conservé dans tous les cas.
          </p>
          <div className="space-y-2">
            {removalRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-amber-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{req.dancerName}</p>
                  <p className="text-xs text-gray-500 truncate">{req.accountEmail}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleRejectRemoval(req)}
                    disabled={processingRequestId === req.id}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Refuser
                  </button>
                  <button
                    onClick={() => handleApproveRemoval(req)}
                    disabled={processingRequestId === req.id}
                    className="text-sm font-medium bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {processingRequestId === req.id ? 'Traitement…' : 'Valider le retrait'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {requestError && <p className="mt-3 text-sm text-red-600" role="alert">{requestError}</p>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer par nom ou prénom…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <span className="text-sm text-gray-400 self-center whitespace-nowrap">{filtered.length} danseur(s)</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <select
          value={selectedRole}
          onChange={e => setSelectedRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">Tous les rôles</option>
          {roleOptions.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">Tous les statuts de cotisation</option>
          {Object.entries(STATUS_LABEL).filter(([key]) => key !== 'active').map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
          <option value="none">Sans cotisation</option>
        </select>
      </div>

      {removalHistory.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {showHistory ? '▾' : '▸'} Historique des départs ({removalHistory.length})
          </button>
          {showHistory && (
            <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {removalHistory.map(h => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{h.dancerName}</p>
                    <p className="text-xs text-gray-500 truncate">{h.accountEmail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-600">
                      {REMOVAL_STATUS_LABEL[h.status ?? ''] ?? h.status}
                    </p>
                    {h.reviewedAt && (
                      <p className="text-xs text-gray-400">
                        {new Date(h.reviewedAt.seconds * 1000).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deletedCount > 0 && (
        <label className="flex items-center gap-2 mb-3 text-sm text-gray-500 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={e => setShowDeleted(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Afficher les fiches supprimées ({deletedCount})
        </label>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 w-10"></th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prénom</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Plan</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Méthode</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Montant</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => (
                <tr key={row.id} className={`hover:bg-gray-50/50 ${row.isDeleted ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2">
                    {row.photoUrl ? (
                      <img src={row.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {row.firstName[0]}{row.lastName[0]}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {row.lastName}
                    {row.isDeleted && (
                      <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">Supprimé</span>
                    )}
                    {!row.isDeleted && row.isDetached && (
                      <span
                        className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium"
                        title="Rattaché à aucun compte : la fiche et l'historique sont conservés, mais la personne ne peut plus se connecter."
                      >
                        Détaché
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{row.firstName}</td>
                  <td className="px-3 py-3 text-gray-600 hidden sm:table-cell max-w-[160px]">
                    {row.info ? (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {row.info.isGroup && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Groupe</span>
                        )}
                        {row.info.planLabel && (
                          <span className="truncate max-w-[120px]" title={row.info.planLabel}>{row.info.planLabel}</span>
                        )}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {row.info?.paymentMethod
                      ? METHOD_LABEL[row.info.paymentMethod] ?? row.info.paymentMethod
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-700 hidden md:table-cell whitespace-nowrap">
                    {row.info ? `${(row.info.totalDue / 100).toFixed(2)} €` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {row.info ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[row.info.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[row.info.status] ?? row.info.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">Pas de cotisation</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <Link href={`/admin/dancers/${row.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800">
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    Aucun danseur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
