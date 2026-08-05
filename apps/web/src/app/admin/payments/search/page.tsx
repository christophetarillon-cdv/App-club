'use client';

import { useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface AccountHit {
  id: string;
  email: string;
  displayName: string;
  isDeleted: boolean;
  dancerIds: string[];
}
interface DancerHit { id: string; firstName: string; lastName: string; isDeleted: boolean; memberNumber?: string }
interface ArchivedHit {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  memberNumber?: string;
  accountId?: string;
  dancerId?: string;
  archivedAt?: { seconds: number };
}
interface DepartureHit {
  id: string;
  dancerName: string;
  status?: string;
  reason?: string;
  reviewedAt?: { seconds: number };
}
interface MembershipHit {
  id: string;
  dancerName?: string;
  seasonId: string;
  totalDue: number;
  totalPaid: number;
  paymentPlanStatus?: string;
  payerName?: string;
}

const DEPARTURE_LABEL: Record<string, string> = {
  pending: 'Demande en attente',
  approved: 'Retrait validé',
  rejected: 'Refusé',
  'auto-approved': 'Compte supprimé par l’adhérent',
};

const fmtDate = (ts?: { seconds: number }) =>
  ts ? new Date(ts.seconds * 1000).toLocaleDateString('fr-FR') : '';
const fmtEuros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

export default function EmailSearchPage() {
  const [input, setInput] = useState('');
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState<AccountHit[]>([]);
  const [dancers, setDancers] = useState<DancerHit[]>([]);
  const [archived, setArchived] = useState<ArchivedHit[]>([]);
  const [departures, setDepartures] = useState<DepartureHit[]>([]);
  const [memberships, setMemberships] = useState<MembershipHit[]>([]);
  const [seasonLabels, setSeasonLabels] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<string[]>([]);

  // Les e-mails ne sont pas normalisés en base (aucun champ emailLower) : on
  // interroge donc la saisie telle quelle ET sa version en minuscules, ce qui
  // couvre la quasi-totalité des cas sans migrer les données existantes.
  const variants = (raw: string) => [...new Set([raw.trim(), raw.trim().toLowerCase()])].filter(Boolean);

  const runSearch = async () => {
    const email = input.trim();
    if (!email || loading) return;
    setLoading(true);
    setSearched(email);
    setBlocked([]);

    const emails = variants(email);
    const failures: string[] = [];

    // Chaque bloc est chargé indépendamment : les collections n'ont pas les
    // mêmes règles d'accès (l'historique des départs exige la permission
    // /admin/dancers), un refus ne doit donc pas faire échouer toute la page.
    const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.error(`${label} search failed`, error);
        failures.push(label);
        return fallback;
      }
    };

    const dedupe = <T extends { id: string }>(rows: T[]) =>
      [...new Map(rows.map(r => [r.id, r])).values()];

    const accountHits = await safe('Comptes', async () => {
      const snaps = await Promise.all(
        emails.map(e => getDocs(query(collection(db, 'accounts'), where('email', '==', e)))),
      );
      return dedupe(snaps.flatMap(s => s.docs.map(d => ({
        id: d.id,
        email: d.data().email ?? '',
        displayName: d.data().displayName ?? '',
        isDeleted: d.data().isDeleted === true,
        dancerIds: d.data().dancerIds ?? [],
      } as AccountHit))));
    }, [] as AccountHit[]);

    const archivedHits = await safe('Identités archivées', async () => {
      const snaps = await Promise.all(
        emails.map(e => getDocs(query(collection(db, 'accountingIdentities'), where('email', '==', e)))),
      );
      return dedupe(snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as ArchivedHit))));
    }, [] as ArchivedHit[]);

    const departureHits = await safe('Départs', async () => {
      const snaps = await Promise.all(
        emails.map(e => getDocs(query(collection(db, 'dancerRemovalRequests'), where('accountEmail', '==', e)))),
      );
      return dedupe(snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as DepartureHit))))
        .sort((a, b) => (b.reviewedAt?.seconds ?? 0) - (a.reviewedAt?.seconds ?? 0));
    }, [] as DepartureHit[]);

    const membershipHits = await safe('Cotisations', async () => {
      const snaps = await Promise.all(
        emails.map(e => getDocs(query(collection(db, 'memberships'), where('payerEmail', '==', e)))),
      );
      return dedupe(snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as MembershipHit))));
    }, [] as MembershipHit[]);

    // Fiches danseurs : celles du compte trouvé + celles citées par l'archive.
    const dancerIds = [...new Set([
      ...accountHits.flatMap(a => a.dancerIds),
      ...archivedHits.map(a => a.dancerId).filter(Boolean) as string[],
    ])];
    const dancerHits = await safe('Danseurs', async () => {
      const snaps = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
      return snaps.filter(s => s.exists()).map(d => ({
        id: d.id,
        firstName: d.data()?.firstName ?? '',
        lastName: d.data()?.lastName ?? '',
        isDeleted: d.data()?.isDeleted === true,
        memberNumber: d.data()?.memberNumber,
      } as DancerHit));
    }, [] as DancerHit[]);

    const labels = await safe('Saisons', async () => {
      const snap = await getDocs(collection(db, 'seasons'));
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.id] = d.data().label ?? d.id; });
      return map;
    }, {} as Record<string, string>);

    setAccounts(accountHits);
    setArchived(archivedHits);
    setDepartures(departureHits);
    setMemberships(membershipHits);
    setDancers(dancerHits);
    setSeasonLabels(labels);
    setBlocked(failures);
    setLoading(false);
  };

  const nothingFound = searched && !loading
    && accounts.length === 0 && archived.length === 0
    && departures.length === 0 && memberships.length === 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/payments/today" className="text-sm text-gray-400 hover:text-gray-700">← Admin</Link>
        <h1 className="text-2xl font-bold text-gray-900">Recherche par e-mail</h1>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Retrouve un adhérent à partir de son adresse, y compris après la suppression de son compte —
        les pièces comptables doivent rester rattachables pendant la durée de conservation légale.
      </p>

      <div className="flex gap-2 mb-6 max-w-xl">
        <input
          type="email"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
          placeholder="adresse@exemple.fr"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        <button
          onClick={runSearch}
          disabled={!input.trim() || loading}
          className="bg-blue-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm shrink-0"
        >
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </div>

      {blocked.length > 0 && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Certaines sections n’ont pas pu être consultées faute de droits : {blocked.join(', ')}.
        </p>
      )}

      {nothingFound && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          Aucun résultat pour « {searched} ».
          <br />
          <span className="text-xs">Vérifiez l’orthographe : la recherche porte sur l’adresse exacte.</span>
        </div>
      )}

      {accounts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Compte</h2>
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-gray-900">{acc.displayName || '(sans nom)'}</p>
                {acc.isDeleted && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-medium">Supprimé</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">{acc.email}</p>
              {dancers.filter(d => acc.dancerIds.includes(d.id)).map(d => (
                <Link
                  key={d.id}
                  href={`/admin/dancers/${d.id}`}
                  className="flex items-center justify-between gap-3 border-t border-gray-100 py-2 hover:bg-gray-50/50"
                >
                  <span className="text-sm text-gray-800">
                    {d.firstName} {d.lastName}
                    {d.isDeleted && <span className="ml-2 text-xs text-gray-400">(supprimé)</span>}
                  </span>
                  <span className="text-xs text-gray-400">{d.memberNumber ?? ''}</span>
                </Link>
              ))}
            </div>
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Identité archivée</h2>
          <p className="text-xs text-gray-500 mb-3">
            Figée lors de la suppression du compte, pour rattacher les pièces comptables. Conservation 10 ans.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {archived.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{a.firstName} {a.lastName}</p>
                  <p className="text-xs text-gray-500">{a.email}</p>
                </div>
                <div className="text-right shrink-0">
                  {a.memberNumber && <p className="text-xs text-gray-600">N° {a.memberNumber}</p>}
                  <p className="text-xs text-gray-400">Supprimé le {fmtDate(a.archivedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {departures.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Départs</h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {departures.map(d => (
              <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-900 truncate">{d.dancerName}</p>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-gray-600">{DEPARTURE_LABEL[d.status ?? ''] ?? d.status}</p>
                  <p className="text-xs text-gray-400">{fmtDate(d.reviewedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {memberships.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Cotisations</h2>
          <p className="text-xs text-gray-500 mb-3">
            Cotisations dont l’identité du payeur a été figée à la création.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {memberships.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{m.dancerName ?? '(danseur inconnu)'}</p>
                  <p className="text-xs text-gray-500">{seasonLabels[m.seasonId] ?? m.seasonId}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-gray-800 tabular-nums">
                    {fmtEuros(m.totalPaid ?? 0)} / {fmtEuros(m.totalDue ?? 0)}
                  </p>
                  {m.paymentPlanStatus && <p className="text-xs text-gray-400">{m.paymentPlanStatus}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
