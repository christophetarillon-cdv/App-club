'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { Season, Dancer, DancerRole } from '@cdv/types';
import { RichTextEditor } from '@/components/RichTextEditor';

const ROLE_LABELS: Record<DancerRole, string> = {
  member: 'Membre', trial: 'Essai', instructor: 'Moniteur', bureau: 'Bureau', admin: 'Admin', pointage: 'Pointage',
};
const ROLE_OPTIONS: DancerRole[] = ['member', 'trial', 'instructor', 'bureau', 'admin', 'pointage'];

interface Campaign {
  id: string;
  subject: string;
  recipientCount: number;
  recipientDescription: string;
  sentAt?: { toDate: () => Date };
}

export default function EmailsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>('all');
  const [selectedRoles, setSelectedRoles] = useState<DancerRole[]>([]);

  const [mode, setMode] = useState<'filters' | 'individual' | 'google-groups'>('filters');
  const [allDancers, setAllDancers] = useState<Dancer[]>([]);
  const [dancerSearch, setDancerSearch] = useState('');
  const [selectedDancerIds, setSelectedDancerIds] = useState<Set<string>>(new Set());

  const [googleGroups, setGoogleGroups] = useState<{ resourceName: string; name: string; memberCount: number }[] | null>(null);
  const [loadingGoogleGroups, setLoadingGoogleGroups] = useState(false);
  const [selectedGroupResourceName, setSelectedGroupResourceName] = useState('');
  const [loadingGroupEmails, setLoadingGroupEmails] = useState(false);

  const [recipientEmails, setRecipientEmails] = useState<string[] | null>(null);
  const [resolving, setResolving] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))).then(snap => {
      setSeasons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Season)));
    });
    getDocs(collection(db, 'dancers')).then(snap => {
      setAllDancers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dancer)));
    });
    loadCampaigns();
  }, []);

  const loadCampaigns = () => {
    setLoadingCampaigns(true);
    getDocs(query(collection(db, 'emailCampaigns'), orderBy('sentAt', 'desc'), limit(20)))
      .then(snap => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign))))
      .finally(() => setLoadingCampaigns(false));
  };

  const toggleRole = (role: DancerRole) => {
    setSelectedRoles(r => r.includes(role) ? r.filter(x => x !== role) : [...r, role]);
    setRecipientEmails(null);
  };

  const filteredDancers = useMemo(() => {
    const q = dancerSearch.trim().toLowerCase();
    if (!q) return allDancers;
    return allDancers.filter(d => `${d.firstName} ${d.lastName}`.toLowerCase().includes(q));
  }, [allDancers, dancerSearch]);

  const toggleDancer = (id: string) => {
    setSelectedDancerIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setRecipientEmails(null);
  };

  const recipientDescription = useMemo(() => {
    if (mode === 'individual') return `${selectedDancerIds.size} danseur(s) sélectionné(s) individuellement`;
    if (mode === 'google-groups') {
      const g = googleGroups?.find(g => g.resourceName === selectedGroupResourceName);
      return g ? `Dossier Google : ${g.name}` : 'Aucun dossier sélectionné';
    }
    const seasonLabel = seasonId === 'all' ? 'Tous les danseurs' : `Saison ${seasons.find(s => s.id === seasonId)?.label ?? seasonId}`;
    const roleLabel = selectedRoles.length > 0 ? `Rôle(s): ${selectedRoles.map(r => ROLE_LABELS[r]).join(', ')}` : null;
    return [seasonLabel, roleLabel].filter(Boolean).join(' · ');
  }, [mode, selectedDancerIds, seasonId, seasons, selectedRoles, googleGroups, selectedGroupResourceName]);

  const loadGoogleGroups = async () => {
    setLoadingGoogleGroups(true);
    try {
      const fn = httpsCallable<void, { groups: { resourceName: string; name: string; memberCount: number }[] }>(functions, 'listGoogleContactGroups');
      const res = await fn();
      setGoogleGroups(res.data.groups);
    } catch (err) {
      console.error('listGoogleContactGroups failed:', err);
      setGoogleGroups([]);
    } finally {
      setLoadingGoogleGroups(false);
    }
  };

  const handleSelectGroup = async (resourceName: string) => {
    setSelectedGroupResourceName(resourceName);
    setRecipientEmails(null);
    if (!resourceName) return;
    setLoadingGroupEmails(true);
    try {
      const fn = httpsCallable<{ resourceName: string }, { emails: string[] }>(functions, 'getGoogleContactGroupEmails');
      const res = await fn({ resourceName });
      setRecipientEmails(res.data.emails);
    } catch (err) {
      console.error('getGoogleContactGroupEmails failed:', err);
      setRecipientEmails([]);
    } finally {
      setLoadingGroupEmails(false);
    }
  };

  const resolveRecipients = async (): Promise<string[]> => {
    if (mode === 'google-groups') return recipientEmails ?? [];
    setResolving(true);
    try {
      let dancerIds: string[];
      if (mode === 'individual') {
        dancerIds = [...selectedDancerIds];
      } else {
        const dancersSnap = seasonId === 'all'
          ? await getDocs(collection(db, 'dancers'))
          : await getDocs(query(collection(db, 'dancers'), where('validatedSeasonIds', 'array-contains', seasonId)));
        let docs = dancersSnap.docs;
        if (selectedRoles.length > 0) {
          docs = docs.filter(d => {
            const roles: string[] = d.data().roles ?? [];
            return selectedRoles.some(r => roles.includes(r));
          });
        }
        dancerIds = docs.map(d => d.id);
      }

      const dancerDocs = await Promise.all(dancerIds.map(id => getDoc(doc(db, 'dancers', id))));
      const accountIds = [...new Set(dancerDocs.map(s => s.data()?.accountId as string).filter(Boolean))];
      const accountSnaps = await Promise.all(accountIds.map(id => getDoc(doc(db, 'accounts', id))));
      const emails = accountSnaps
        .map(s => s.data()?.email as string | undefined)
        .filter((e): e is string => !!e);
      return [...new Set(emails)];
    } finally {
      setResolving(false);
    }
  };

  const handlePreviewCount = async () => {
    const emails = await resolveRecipients();
    setRecipientEmails(emails);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    const emails = recipientEmails ?? await resolveRecipients();
    if (emails.length === 0) { setResult('Aucun destinataire trouvé.'); return; }
    if (!confirm(`Envoyer cet email à ${emails.length} destinataire(s) ?`)) return;

    setSending(true); setResult(null);
    try {
      const fn = httpsCallable<
        { subject: string; bodyHtml: string; recipientEmails: string[]; recipientDescription: string },
        { sent: number; campaignId: string }
      >(functions, 'sendClubEmail', { timeout: 120000 });
      const res = await fn({ subject, bodyHtml: body, recipientEmails: emails, recipientDescription });
      setResult(`Email envoyé à ${res.data.sent} destinataire(s).`);
      setSubject(''); setBody(''); setRecipientEmails(null); setShowPreview(false);
      loadCampaigns();
    } catch (err) {
      console.error('sendClubEmail failed:', err);
      setResult("L'envoi a échoué.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Envoi d'emails</h1>
      <p className="text-sm text-gray-500 mb-6">
        Envoie un email aux danseurs via le compte Google connecté (Admin → Intégration Google).
        Les destinataires sont en copie cachée (Bcc), ils ne voient pas les adresses des autres.
      </p>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
          <div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('filters')}
                className={`text-sm px-3 py-1.5 rounded-lg border ${mode === 'filters' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                Filtrer par saison / rôle
              </button>
              <button onClick={() => setMode('individual')}
                className={`text-sm px-3 py-1.5 rounded-lg border ${mode === 'individual' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                Sélection individuelle
              </button>
              <button onClick={() => { setMode('google-groups'); if (googleGroups === null) loadGoogleGroups(); }}
                className={`text-sm px-3 py-1.5 rounded-lg border ${mode === 'google-groups' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
                Dossiers Google
              </button>
            </div>

            {mode === 'filters' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Saison</label>
                  <select value={seasonId} onChange={e => { setSeasonId(e.target.value); setRecipientEmails(null); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                    <option value="all">Tous les danseurs</option>
                    {seasons.map(s => <option key={s.id} value={s.id}>Saison {s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">Rôle (optionnel)</label>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {ROLE_OPTIONS.map(r => (
                      <label key={r} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={selectedRoles.includes(r)} onChange={() => toggleRole(r)} />
                        {ROLE_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : mode === 'individual' ? (
              <div>
                <input type="text" placeholder="Rechercher un danseur…" value={dancerSearch}
                  onChange={e => setDancerSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {filteredDancers.map(d => (
                    <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={selectedDancerIds.has(d.id)} onChange={() => toggleDancer(d.id)} />
                      {d.firstName} {d.lastName}
                    </label>
                  ))}
                  {filteredDancers.length === 0 && <p className="text-sm text-gray-400 px-3 py-2">Aucun résultat.</p>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{selectedDancerIds.size} sélectionné(s)</p>
              </div>
            ) : (
              <div>
                {loadingGoogleGroups ? (
                  <p className="text-sm text-gray-500">Récupération des dossiers du compte Google connecté…</p>
                ) : googleGroups !== null && googleGroups.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucun dossier trouvé sur ce compte.</p>
                ) : googleGroups !== null ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1">Dossier Google</label>
                    <select value={selectedGroupResourceName} onChange={e => handleSelectGroup(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                      <option value="">Choisir un dossier…</option>
                      {googleGroups.map(g => (
                        <option key={g.resourceName} value={g.resourceName}>{g.name} ({g.memberCount})</option>
                      ))}
                    </select>
                    {loadingGroupEmails && <p className="text-xs text-gray-500 mt-2">Récupération des adresses du dossier…</p>}
                  </div>
                ) : null}
              </div>
            )}

            {mode !== 'google-groups' && (
              <button onClick={handlePreviewCount} disabled={resolving}
                className="text-sm text-blue-600 hover:underline mt-2 disabled:opacity-50">
                {resolving ? 'Calcul…' : 'Voir le nombre de destinataires'}
              </button>
            )}
            {recipientEmails !== null && (
              <p className="text-sm text-gray-600 mt-1">{recipientEmails.length} destinataire(s).</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Sujet</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Message</label>
            <RichTextEditor value={body} onChange={setBody} />
          </div>

          {result && <p className="text-sm text-gray-700">{result}</p>}

          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)} disabled={!subject.trim() || !body.trim()}
              className="border border-gray-300 text-gray-700 rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              Aperçu
            </button>
            <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}
              className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-fit">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Historique des envois</h2>
          {loadingCampaigns ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun envoi pour l'instant.</p>
          ) : (
            <ul className="space-y-3">
              {campaigns.map(c => (
                <li key={c.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.subject}</p>
                  <p className="text-xs text-gray-500">{c.recipientDescription}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.sentAt?.toDate?.().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{c.recipientCount} destinataire(s)
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
              <p className="font-semibold text-gray-900">Aperçu</p>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-400 mb-1">Sujet</p>
              <p className="text-sm font-medium text-gray-900 mb-4">{subject}</p>
              <p className="text-xs text-gray-400 mb-1">Message</p>
              <div className="text-sm text-gray-800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: body }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
