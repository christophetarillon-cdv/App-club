'use client';

import { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc,
  deleteField, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Dancer } from '@cdv/types';

interface TrialDancer extends Dancer {
  accountEmail?: string;
}

function formatDate(ts: { seconds: number } | undefined): string {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('fr-FR');
}

export default function AdminTrialPage() {
  const [dancers, setDancers] = useState<TrialDancer[]>([]);
  const [maxTrialSessions, setMaxTrialSessions] = useState(3);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState<string | null>(null);
  const [incrementing, setIncrementing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [settingsSnap, dancersSnap] = await Promise.all([
      getDoc(doc(db, 'appSettings', 'main')),
      getDocs(query(collection(db, 'dancers'), where('roles', 'array-contains', 'trial'), orderBy('createdAt', 'desc'))),
    ]);

    if (settingsSnap.exists()) {
      setMaxTrialSessions(settingsSnap.data().trialMaxSessions ?? 3);
    }

    const list: TrialDancer[] = await Promise.all(
      dancersSnap.docs.map(async d => {
        const dancer = { id: d.id, ...d.data() } as TrialDancer;
        try {
          const accountSnap = await getDoc(doc(db, 'accounts', dancer.accountId));
          if (accountSnap.exists()) dancer.accountEmail = accountSnap.data().email;
        } catch { /* ignore */ }
        return dancer;
      })
    );

    setDancers(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleIncrement = async (dancer: TrialDancer) => {
    setIncrementing(dancer.id);
    try {
      const newCount = (dancer.trialSessionsUsed ?? 0) + 1;
      await updateDoc(doc(db, 'dancers', dancer.id), {
        trialSessionsUsed: newCount,
        updatedAt: serverTimestamp(),
      });
      setDancers(prev => prev.map(d =>
        d.id === dancer.id ? { ...d, trialSessionsUsed: newCount } : d
      ));
    } finally {
      setIncrementing(null);
    }
  };

  const handleConvert = async (dancer: TrialDancer) => {
    if (!confirm(`Convertir ${dancer.firstName} ${dancer.lastName} en membre ?`)) return;
    setConverting(dancer.id);
    try {
      await updateDoc(doc(db, 'dancers', dancer.id), {
        roles: ['member'],
        trialStartDate: deleteField(),
        trialExpiresAt: deleteField(),
        trialSessionsUsed: deleteField(),
        updatedAt: serverTimestamp(),
      });
      setDancers(prev => prev.filter(d => d.id !== dancer.id));
    } finally {
      setConverting(null);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Chargement…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Danseurs en essai</h1>
          <p className="text-sm text-gray-500 mt-1">
            {dancers.length} danseur{dancers.length !== 1 ? 's' : ''} — {maxTrialSessions} séances autorisées
          </p>
        </div>
      </div>

      {dancers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm">Aucun danseur en période d'essai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dancers.map(dancer => {
            const sessions = dancer.trialSessionsUsed ?? 0;
            const isAtLimit = sessions >= maxTrialSessions;
            return (
              <div key={dancer.id}
                className={`bg-white rounded-xl border p-5 flex items-center justify-between gap-4 ${
                  isAtLimit ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-orange-100 flex items-center justify-center flex-shrink-0">
                    {dancer.photoUrl
                      ? <img src={dancer.photoUrl} alt="" className="w-full h-full object-cover" />
                      : <span className="text-orange-700 font-bold text-sm">{dancer.firstName[0]}{dancer.lastName[0]}</span>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{dancer.firstName} {dancer.lastName}</p>
                    {dancer.accountEmail && (
                      <p className="text-xs text-gray-400 truncate">{dancer.accountEmail}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-semibold ${isAtLimit ? 'text-orange-600' : 'text-gray-500'}`}>
                        {sessions} / {maxTrialSessions} séances
                      </span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">Depuis le {formatDate(dancer.trialStartDate as any)}</span>
                      {dancer.trialExpiresAt && (
                        <>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-400">Expire le {formatDate(dancer.trialExpiresAt as any)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleIncrement(dancer)}
                    disabled={incrementing === dancer.id}
                    className="text-xs font-semibold px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
                    {incrementing === dancer.id ? '…' : '+ Séance'}
                  </button>
                  <button
                    onClick={() => handleConvert(dancer)}
                    disabled={converting === dancer.id}
                    className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {converting === dancer.id ? '…' : 'Convertir en membre'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
