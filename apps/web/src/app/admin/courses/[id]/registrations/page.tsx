'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, query, where, doc, getDoc, updateDoc, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Registration {
  id: string;
  userId: string;
  courseId: string;
  seasonId: string;
  registeredAt: string;
  status: 'active' | 'waitlist' | 'cancelled';
}

interface UserInfo {
  displayName: string;
  email: string;
  phone?: string;
}

type RowItem = Registration & { user: UserInfo };

const STATUS_LABEL: Record<string, string> = {
  active: 'Inscrit',
  waitlist: 'Liste d\'attente',
  cancelled: 'Annulé',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  waitlist: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function CourseRegistrationsPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [courseName, setCourseName] = useState('');
  const [levelName, setLevelName] = useState('');
  const [levelOrder, setLevelOrder] = useState<number | null>(null);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'waitlist'>('active');
  const [refDate, setRefDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    const d = searchParams.get('refDate');
    if (d) setRefDate(d);
  }, [searchParams]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [courseSnap, regsSnap] = await Promise.all([
        getDoc(doc(db, 'courses', courseId)),
        getDocs(query(collection(db, 'registrations'), where('courseId', '==', courseId))),
      ]);

      if (courseSnap.exists()) {
        setCourseName(courseSnap.data().name);
        const levelSnap = await getDoc(doc(db, 'levels', courseSnap.data().levelId));
        if (levelSnap.exists()) {
          setLevelName(levelSnap.data().name);
          setLevelOrder(levelSnap.data().order ?? null);
        }
      }

      const regs = regsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Registration));

      const enriched = await Promise.all(regs.map(async (reg) => {
        const accountSnap = await getDoc(doc(db, 'accounts', reg.userId));
        const user: UserInfo = accountSnap.exists()
          ? { displayName: accountSnap.data().displayName, email: accountSnap.data().email, phone: accountSnap.data().phone }
          : { displayName: reg.userId, email: '—' };
        return { ...reg, user };
      }));

      enriched.sort((a, b) => {
        const order = { active: 0, waitlist: 1, cancelled: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.registeredAt.localeCompare(b.registeredAt);
      });

      setRows(enriched);
      setLoading(false);
    };
    load();
  }, [courseId]);

  const handleCancel = async (row: RowItem) => {
    if (!confirm(`Désinscrire ${row.user.displayName} ?`)) return;
    setCancelling(row.id);
    try {
      await updateDoc(doc(db, 'registrations', row.id), { status: 'cancelled' });
      await updateDoc(doc(db, 'accounts', row.userId), {
        registeredCourseIds: arrayRemove(courseId),
      });
      if (row.status === 'active') {
        await updateDoc(doc(db, 'courses', courseId), {
          activeRegistrationCount: increment(-1),
        });
      }
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'cancelled' } : r));
    } finally {
      setCancelling(null);
    }
  };

  const exportCsv = () => {
    const visible = filtered;
    const lines = [
      ['Cours', 'Niveau', 'Nom', 'Email', 'Téléphone', 'Statut', 'Date inscription'].join(';'),
      ...visible.map(r => [
        courseName,
        levelName,
        r.user.displayName,
        r.user.email,
        r.user.phone ?? '',
        STATUS_LABEL[r.status] ?? r.status,
        r.registeredAt,
      ].join(';')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileLabel = levelOrder !== null && levelName
      ? courseName.replace(`(${levelOrder})`, `(${levelName})`)
      : courseName || courseId;
    a.download = `inscriptions-${fileLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const byDate = rows.filter(r => r.registeredAt <= refDate);
  const filtered = filter === 'all' ? byDate : byDate.filter(r => r.status === filter);
  const activeCount = byDate.filter(r => r.status === 'active').length;
  const waitlistCount = byDate.filter(r => r.status === 'waitlist').length;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin/courses" className="text-sm text-gray-400 hover:text-gray-700">← Cours</Link>
        </div>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inscriptions</h1>
            {courseName && <p className="text-sm text-gray-500 mt-0.5">{courseName}</p>}
            <div className="flex gap-3 mt-2 text-sm">
              <span className="text-green-700 font-medium">{activeCount} inscrit{activeCount > 1 ? 's' : ''}</span>
              {waitlistCount > 0 && <span className="text-orange-600">{waitlistCount} en attente</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/courses/${courseId}/sessions`}
              className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg px-3 py-2">
              Séances
            </Link>
            <button onClick={exportCsv}
              className="text-sm bg-gray-800 text-white rounded-lg px-3 py-2 hover:bg-gray-900">
              Exporter CSV
            </button>
          </div>
        </div>

        {/* Date de référence */}
        <div className="flex items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
            Liste au
          </label>
          <input
            type="date"
            value={refDate}
            onChange={e => setRefDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <p className="text-xs text-gray-400">
            Seules les inscriptions antérieures ou égales à cette date sont affichées.
          </p>
        </div>

        {/* Filtres */}
        <div className="flex gap-2 mb-4">
          {(['active', 'waitlist', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'active' ? 'Inscrits' : f === 'waitlist' ? 'Liste d\'attente' : 'Tous'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400">Aucune inscription.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Inscrit le</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{row.user.displayName}</td>
                    <td className="px-5 py-3 text-gray-500 hidden sm:table-cell">{row.user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 hidden sm:table-cell">{row.registeredAt}</td>
                    <td className="px-5 py-3 text-right">
                      {row.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancel(row)}
                          disabled={cancelling === row.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {cancelling === row.id ? '…' : 'Désinscrire'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
