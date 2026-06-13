'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

interface DanceStyle { id: string; name: string; color: string; }
interface Level { id: string; name: string; order: number; }

export default function ProfileLevelsPage() {
  const { user, account } = useAuth();
  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelsByStyle, setLevelsByStyle] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [stylesSnap, levelsSnap] = await Promise.all([
        getDocs(query(collection(db, 'danceStyles'), orderBy('name'))),
        getDocs(query(collection(db, 'levels'), orderBy('order'))),
      ]);
      setStyles(stylesSnap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color })));
      setLevels(levelsSnap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order })));
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!account?.levelsByStyle) return;
    const normalized: Record<string, string[]> = {};
    for (const [styleId, val] of Object.entries(account.levelsByStyle)) {
      normalized[styleId] = Array.isArray(val) ? val : [val as string];
    }
    setLevelsByStyle(normalized);
  }, [account]);

  const toggle = (styleId: string, levelId: string) => {
    setSaved(false);
    setLevelsByStyle(prev => {
      const current = prev[styleId] ?? [];
      const next = current.includes(levelId)
        ? current.filter(id => id !== levelId)
        : [...current, levelId];
      return { ...prev, [styleId]: next };
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true); setSaved(false);
    const cleaned = Object.fromEntries(
      Object.entries(levelsByStyle).filter(([, ids]) => ids.length > 0)
    );
    await updateDoc(doc(db, 'accounts', user.uid), { levelsByStyle: cleaned });
    setSaving(false); setSaved(true);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto pt-8 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile" className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-2xl font-bold text-gray-900">Mes niveaux</h1>
        </div>

        <p className="text-sm text-gray-500">
          Déclarez votre niveau pour chaque style de danse. Ces informations sont utilisées pour vérifier votre éligibilité lors de l&apos;inscription à un cours.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
          {styles.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Aucun style de danse configuré.</p>
          )}
          {styles.map(style => (
            <div key={style.id}>
              <p className="text-sm font-semibold text-gray-700 mb-2.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: style.color }} />
                {style.name}
              </p>
              <div className="space-y-2 pl-4">
                {levels.map(level => {
                  const checked = (levelsByStyle[style.id] ?? []).includes(level.id);
                  return (
                    <label key={level.id} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(style.id, level.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className={`text-sm ${checked ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                        {level.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {saved && <p className="text-green-600 text-sm text-center">Niveaux enregistrés.</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
