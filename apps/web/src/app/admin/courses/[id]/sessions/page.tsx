'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, orderBy, query, where, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Session {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled' | 'extra';
  cancellationReason?: string;
}

interface Course {
  id: string;
  name: string;
}

const DAY_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export default function SessionsPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelModal, setCancelModal] = useState<Session | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [courseSnap, sessionsSnap] = await Promise.all([
      getDoc(doc(db, 'courses', courseId)),
      getDocs(query(
        collection(db, 'sessions'),
        where('courseId', '==', courseId),
        orderBy('date'),
      )),
    ]);
    if (courseSnap.exists()) setCourse({ id: courseSnap.id, name: courseSnap.data().name });
    setSessions(sessionsSnap.docs.map(d => ({
      id: d.id,
      courseId: d.data().courseId,
      date: d.data().date,
      startTime: d.data().startTime,
      endTime: d.data().endTime,
      status: d.data().status,
      cancellationReason: d.data().cancellationReason,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [courseId]);

  const handleCancel = async () => {
    if (!cancelModal) return;
    setSaving(true);
    await updateDoc(doc(db, 'sessions', cancelModal.id), {
      status: 'cancelled',
      cancellationReason: reason.trim(),
    });
    setCancelModal(null);
    setReason('');
    setSaving(false);
    await load();
  };

  const statusBadge = (s: Session) => {
    if (s.status === 'cancelled') return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Annulée</span>;
    if (s.status === 'extra') return <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Supplémentaire</span>;
    const isPast = s.date < new Date().toISOString().slice(0, 10);
    if (isPast) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Passée</span>;
    return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Planifiée</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Cours</Link>
          <h1 className="text-2xl font-bold text-gray-900">{course?.name ?? 'Séances'}</h1>
        </div>
        <Link href={`/admin/courses/${courseId}/registrations`}
          className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 font-medium">
          Inscriptions
        </Link>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <div className="space-y-2">
          {sessions.length === 0 && (
            <p className="text-gray-400 text-sm">Aucune séance générée pour ce cours.</p>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className={`bg-white rounded-xl border shadow-sm px-5 py-3 flex items-center justify-between ${s.status === 'cancelled' ? 'border-red-100 opacity-60' : 'border-gray-200'}`}
            >
              <div className="flex items-center gap-4">
                {statusBadge(s)}
                <span className={`text-sm font-medium ${s.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {formatDate(s.date)}
                </span>
                <span className="text-sm text-gray-400">{s.startTime}–{s.endTime}</span>
                {s.cancellationReason && (
                  <span className="text-xs text-red-400 italic">{s.cancellationReason}</span>
                )}
              </div>
              {s.status === 'scheduled' && (
                <button
                  onClick={() => { setCancelModal(s); setReason(''); }}
                  className="text-sm text-red-500 hover:underline"
                >
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {cancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Annuler la séance</h2>
            <p className="text-sm text-gray-600">
              {formatDate(cancelModal.date)} · {cancelModal.startTime}–{cancelModal.endTime}
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Motif (optionnel)
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                placeholder="ex : Salle indisponible"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/50 resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setCancelModal(null)}
                className="border border-gray-300 text-gray-600 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                Fermer
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="bg-red-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm"
              >
                {saving ? 'Annulation…' : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
