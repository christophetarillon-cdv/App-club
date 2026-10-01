'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection, getDocs, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { DiscountCode } from '@cdv/types';

interface Season { id: string; label: string; }
interface DancerLite { id: string; firstName: string; lastName: string; }

// Sans caractères ambigus (0/O, 1/I/L) — même alphabet que les codes gagnants
// du tirage au sort, pour pouvoir être communiqué à l'oral sans erreur.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

const emptyForm = { seasonId: '', amount: '', maxUses: '1', label: '' };

export default function DiscountCodesPage() {
  const { user } = useAuth();
  const [codes, setCodes] = useState<(DiscountCode & { id: string })[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [dancers, setDancers] = useState<DancerLite[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedDancerIds, setSelectedDancerIds] = useState<string[]>([]);
  const [dancerSearch, setDancerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);

  const load = async () => {
    const [codesSnap, seasonsSnap, dancersSnap] = await Promise.all([
      getDocs(query(collection(db, 'discountCodes'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))),
      getDocs(collection(db, 'dancers')),
    ]);
    setCodes(codesSnap.docs.map(d => ({ id: d.id, ...d.data() } as DiscountCode & { id: string })));
    const seasonList = seasonsSnap.docs.map(d => ({ id: d.id, label: d.data().label as string }));
    setSeasons(seasonList);
    const activeSeasonId = seasonsSnap.docs.find(d => d.data().isActive)?.id;
    setForm(f => ({ ...f, seasonId: f.seasonId || activeSeasonId || seasonList[0]?.id || '' }));
    setDancers(
      dancersSnap.docs
        .map(d => ({ id: d.id, firstName: d.data().firstName ?? '', lastName: d.data().lastName ?? '', isActive: d.data().isActive !== false }))
        .filter(d => d.isActive)
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr')),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dancerById = useMemo(() => new Map(dancers.map(d => [d.id, d])), [dancers]);
  const seasonById = useMemo(() => new Map(seasons.map(s => [s.id, s.label])), [seasons]);

  const searchResults = useMemo(() => {
    const q = dancerSearch.trim().toLowerCase();
    if (!q) return [];
    return dancers
      .filter(d => !selectedDancerIds.includes(d.id))
      .filter(d => `${d.firstName} ${d.lastName}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [dancerSearch, dancers, selectedDancerIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setLastCreatedCode(null);
    try {
      const amountCents = Math.round(parseFloat(form.amount.replace(',', '.')) * 100);
      const maxUses = parseInt(form.maxUses, 10);
      if (!form.seasonId) { setError('Choisis une saison.'); return; }
      if (!amountCents || amountCents <= 0) { setError('Le montant doit être > 0.'); return; }
      if (!maxUses || maxUses <= 0) { setError("Le nombre d'utilisations doit être > 0."); return; }

      const code = generateCode();
      // setDoc avec le code comme id du document (pas addDoc) : la vérification
      // côté danseur fait un getDoc direct sur cet id exact, comme pour les
      // codes gagnants du tirage au sort.
      await setDoc(doc(db, 'discountCodes', code), {
        code,
        seasonId: form.seasonId,
        discountAmount: amountCents,
        maxUses,
        usesCount: 0,
        allowedDancerIds: selectedDancerIds,
        active: true,
        label: form.label.trim() || null,
        redemptions: [],
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      setLastCreatedCode(code);
      setForm(f => ({ ...emptyForm, seasonId: f.seasonId }));
      setSelectedDancerIds([]);
      setDancerSearch('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: DiscountCode & { id: string }) => {
    await updateDoc(doc(db, 'discountCodes', c.id), { active: !c.active, updatedAt: serverTimestamp() });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce code définitivement ?')) return;
    await deleteDoc(doc(db, 'discountCodes', id));
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Codes de réduction</h1>
      <p className="text-sm text-gray-500 mb-6">
        Réduit le montant d&apos;une cotisation d&apos;un montant fixe — le danseur choisit ensuite normalement son
        mode de paiement sur le reste à payer.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4 max-w-xl mb-8">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saison</label>
          <select value={form.seasonId} onChange={e => setForm(f => ({ ...f, seasonId: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Montant de la réduction (€)</label>
            <input type="number" step="0.01" min="0" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="Ex : 30.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre d&apos;utilisations</label>
            <input type="number" min="1" step="1" value={form.maxUses}
              onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Note <span className="text-gray-300 normal-case">(optionnel, visible seulement ici)</span>
          </label>
          <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Ex : Réduction fratrie Dupont"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Réserver à un ou plusieurs danseurs <span className="text-gray-300 normal-case">(optionnel — vide = utilisable par tout le monde)</span>
          </label>
          {selectedDancerIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedDancerIds.map(id => {
                const d = dancerById.get(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
                    {d ? `${d.firstName} ${d.lastName}` : id}
                    <button type="button" onClick={() => setSelectedDancerIds(prev => prev.filter(x => x !== id))}
                      className="text-blue-400 hover:text-blue-700">✕</button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="relative">
            <input type="text" value={dancerSearch} onChange={e => setDancerSearch(e.target.value)}
              placeholder="Rechercher un danseur par nom…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map(d => (
                  <button key={d.id} type="button"
                    onClick={() => { setSelectedDancerIds(prev => [...prev, d.id]); setDancerSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {d.firstName} {d.lastName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {lastCreatedCode && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <p className="text-sm text-green-700">
              Code créé : <span className="font-mono font-bold">{lastCreatedCode}</span>
            </p>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Création…' : 'Créer le code'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : codes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-400 text-sm">Aucun code de réduction créé.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Saison</th>
                <th className="px-4 py-2">Réduction</th>
                <th className="px-4 py-2">Utilisations</th>
                <th className="px-4 py-2">Réservé à</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono font-semibold text-gray-800">{c.code}</td>
                  <td className="px-4 py-2 text-gray-600">{seasonById.get(c.seasonId) ?? c.seasonId}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{(c.discountAmount / 100).toFixed(2)} €</td>
                  <td className="px-4 py-2 text-gray-600">{c.usesCount} / {c.maxUses}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {c.allowedDancerIds.length === 0 ? (
                      <span className="text-gray-400">Tout le monde</span>
                    ) : (
                      c.allowedDancerIds.map(id => {
                        const d = dancerById.get(id);
                        return d ? `${d.firstName} ${d.lastName}` : id;
                      }).join(', ')
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{c.label || '—'}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => toggleActive(c)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.active ? 'Actif' : 'Désactivé'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:text-red-700">
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
