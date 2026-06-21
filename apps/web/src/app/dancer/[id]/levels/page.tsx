'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface DanceStyle { id: string; name: string; color: string; }
interface Level { id: string; name: string; order: number; }

export default function DancerLevelsPage() {
  const { id } = useParams<{ id: string }>();
  const { user, dancers, loading: authLoading } = useAuth();
  const router = useRouter();

  const dancer = dancers.find(d => d.id === id);

  const [styles, setStyles] = useState<DanceStyle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelsByStyle, setLevelsByStyle] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!authLoading && !dancer) router.replace('/select-dancer');
  }, [authLoading, dancer, router]);

  useEffect(() => {
    const load = async () => {
      const [stylesSnap, levelsSnap] = await Promise.all([
        getDocs(query(collection(db, 'danceStyles'), orderBy('name'))),
        getDocs(query(collection(db, 'levels'), orderBy('order'))),
      ]);
      setStyles(stylesSnap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color })));
      setLevels(levelsSnap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order })));
      setLoadingData(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (dancer?.levelsByStyle) {
      setLevelsByStyle(dancer.levelsByStyle as Record<string, string>);
    }
  }, [dancer?.id]);

  const handleSelect = (styleId: string, levelId: string) => {
    setSaved(false);
    setLevelsByStyle(prev => ({
      ...prev,
      [styleId]: prev[styleId] === levelId ? '' : levelId,
    }));
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true); setSaved(false);
    const cleaned = Object.fromEntries(
      Object.entries(levelsByStyle).filter(([, v]) => v !== '')
    );
    await updateDoc(doc(db, 'dancers', id), { levelsByStyle: cleaned });
    setSaving(false); setSaved(true);
  };

  if (authLoading || !dancer) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/dancer/${id}/profile`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900">Mes niveaux par style</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Niveaux de <span className="font-semibold text-gray-700">{dancer.firstName}</span> — utilisés lors des inscriptions aux cours.
        </p>

        {loadingData ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : styles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">Aucun style de danse configuré.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {styles.map(style => (
              <div key={style.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                  <p className="font-semibold text-gray-900 text-sm">{style.name}</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {levels.map(level => {
                    const selected = levelsByStyle[style.id] === level.id;
                    return (
                      <label key={level.id}
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <input
                          type="radio"
                          name={`style-${style.id}`}
                          checked={selected}
                          onChange={() => handleSelect(style.id, level.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className={`text-sm ${selected ? 'text-blue-700 font-semibold' : 'text-gray-700'}`}>
                          {level.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {saved && <p className="text-green-600 text-sm text-center">Niveaux enregistrés.</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
