'use client';

import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import type { Season } from '@cdv/types';

export default function EmailsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>('all');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))).then(snap => {
      setSeasons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Season)));
    });
  }, []);

  const resolveRecipients = async (): Promise<string[]> => {
    setResolving(true);
    try {
      const dancersSnap = seasonId === 'all'
        ? await getDocs(collection(db, 'dancers'))
        : await getDocs(query(collection(db, 'dancers'), where('validatedSeasonIds', 'array-contains', seasonId)));

      const accountIds = [...new Set(dancersSnap.docs.map(d => d.data().accountId as string).filter(Boolean))];
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
    setRecipientCount(emails.length);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    const emails = await resolveRecipients();
    if (emails.length === 0) { setResult('Aucun destinataire trouvé.'); return; }
    if (!confirm(`Envoyer cet email à ${emails.length} destinataire(s) ?`)) return;

    setSending(true); setResult(null);
    try {
      const fn = httpsCallable<{ subject: string; body: string; recipientEmails: string[] }, { sent: number }>(
        functions, 'sendClubEmail', { timeout: 120000 },
      );
      const res = await fn({ subject, body, recipientEmails: emails });
      setResult(`Email envoyé à ${res.data.sent} destinataire(s).`);
      setSubject(''); setBody(''); setRecipientCount(null);
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5 max-w-2xl">
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Destinataires</label>
          <select value={seasonId} onChange={e => { setSeasonId(e.target.value); setRecipientCount(null); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            <option value="all">Tous les danseurs</option>
            {seasons.map(s => <option key={s.id} value={s.id}>Saison {s.label}</option>)}
          </select>
          <button onClick={handlePreviewCount} disabled={resolving}
            className="text-sm text-blue-600 hover:underline mt-1.5 disabled:opacity-50">
            {resolving ? 'Calcul…' : 'Voir le nombre de destinataires'}
          </button>
          {recipientCount !== null && (
            <p className="text-sm text-gray-600 mt-1">{recipientCount} destinataire(s).</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Sujet</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        {result && <p className="text-sm text-gray-700">{result}</p>}

        <button onClick={handleSend} disabled={sending || !subject.trim() || !body.trim()}
          className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
