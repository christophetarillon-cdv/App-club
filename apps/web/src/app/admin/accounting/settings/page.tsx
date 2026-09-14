'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface AnalyticsCategory {
  id?: string;
  name: string;
  description: string;
  sortOrder: number;
  requiresDetail?: boolean;
}

interface BankAccount {
  id: string;
  name: string;
  bank: string;
  sortOrder: number;
}

interface ChartAccount {
  id?: string;
  label: string;
  sortOrder: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'banks' | 'accounts'>('categories');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<AnalyticsCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, number>>({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sortOrder: 1,
    requiresDetail: false,
  });

  const [chartFormData, setChartFormData] = useState({
    label: '',
    sortOrder: 1,
  });

  // Charger les catégories
  useEffect(() => {
    const q = query(collection(db, 'analyticsCategories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: AnalyticsCategory[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({ id: doc.id, ...docData } as AnalyticsCategory);
        }
      });
      setCategories(data.sort((a, b) => a.sortOrder - b.sortOrder));
    });
    return () => unsubscribe();
  }, []);

  // Charger les comptes traditionnels (liste libre, niveau 1 de ventilation)
  useEffect(() => {
    const q = query(collection(db, 'chartOfAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: ChartAccount[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({ id: doc.id, label: docData.label ?? '', sortOrder: docData.sortOrder ?? 999 });
        }
      });
      setChartAccounts(data.sort((a, b) => a.sortOrder - b.sortOrder));
    });
    return () => unsubscribe();
  }, []);

  // Les comptes bancaires sont gérés dans Finance > Comptes bancaires
  // (collection `bankAccounts`) ; cette page ne fait que lire cette même
  // liste et permet d'ajuster leur ordre d'affichage pour la compta.
  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: BankAccount[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        data.push({
          id: doc.id,
          name: docData.name ?? '',
          bank: docData.bank ?? '',
          sortOrder: docData.sortOrder ?? 999,
        });
      });
      data.sort((a, b) => a.sortOrder - b.sortOrder);
      setBankAccounts(data);
      setOrderDrafts(Object.fromEntries(data.map((a) => [a.id, a.sortOrder])));
    });
    return () => unsubscribe();
  }, []);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingId) {
        const docRef = doc(db, 'analyticsCategories', editingId);
        await updateDoc(docRef, {
          name: formData.name,
          description: formData.description,
          sortOrder: formData.sortOrder,
          requiresDetail: formData.requiresDetail,
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, 'analyticsCategories'), {
          name: formData.name,
          description: formData.description,
          sortOrder: formData.sortOrder,
          requiresDetail: formData.requiresDetail,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user?.uid,
        });
      }
      setFormData({ name: '', description: '', sortOrder: 1, requiresDetail: false });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChartAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingChartId) {
        await updateDoc(doc(db, 'chartOfAccounts', editingChartId), {
          label: chartFormData.label,
          sortOrder: chartFormData.sortOrder,
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, 'chartOfAccounts'), {
          label: chartFormData.label,
          sortOrder: chartFormData.sortOrder,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user?.uid,
        });
      }
      setChartFormData({ label: '', sortOrder: 1 });
      setEditingChartId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChartAccount = (acc: ChartAccount) => {
    setEditingChartId(acc.id || null);
    setChartFormData({ label: acc.label, sortOrder: acc.sortOrder });
    setActiveTab('accounts');
  };

  const handleDeleteChartAccount = async (id: string) => {
    try {
      if (!confirm('Êtes-vous sûr ? Les lignes de ventilation déjà saisies avec ce compte ne seront pas modifiées.')) return;
      await updateDoc(doc(db, 'chartOfAccounts', id), { isActive: false });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleSaveOrder = async (bankId: string) => {
    const sortOrder = orderDrafts[bankId];
    if (sortOrder === undefined || Number.isNaN(sortOrder)) return;

    setSavingOrderId(bankId);
    setError('');
    try {
      await updateDoc(doc(db, 'bankAccounts', bankId), {
        sortOrder,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleDeleteCategory = async (id: string, categoryName: string) => {
    try {
      // Vérifier si la catégorie est utilisée
      const q = query(collection(db, 'accountingEntries'), where('analyticsCategory', '==', categoryName));
      const snapshot = await getDocs(q);

      if (snapshot.size > 0) {
        setError(`Impossible de supprimer "${categoryName}" : ${snapshot.size} écriture(s) l'utilise(nt)`);
        return;
      }

      if (!confirm('Êtes-vous sûr ?')) return;
      const docRef = doc(db, 'analyticsCategories', id);
      await updateDoc(docRef, { isActive: false });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleEditCategory = (cat: AnalyticsCategory) => {
    setEditingId(cat.id || null);
    setFormData({
      name: cat.name, description: cat.description, sortOrder: cat.sortOrder,
      requiresDetail: cat.requiresDetail ?? false,
    });
    setActiveTab('categories');
  };

  if (!user) return <div>Authentification requise</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Paramètres comptabilité</h1>
        <p className="text-gray-600 mt-2">Gérez les catégories analytiques et les comptes bancaires</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Catégories analytiques
        </button>
        <button
          onClick={() => setActiveTab('banks')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'banks'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Comptes bancaires
        </button>
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'accounts'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Comptes traditionnels
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>}

      {/* Catégories */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Formulaire */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
            </h2>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ordre</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requiresDetail}
                  onChange={(e) => setFormData({ ...formData, requiresDetail: e.target.checked })}
                  className="w-4 h-4"
                />
                Nécessite un détail (texte libre) lors de la ventilation
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ name: '', description: '', sortOrder: 1, requiresDetail: false });
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Liste */}
          <div className="col-span-2 bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Liste des catégories</h2>
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <p className="font-medium">
                      {cat.name}
                      {cat.requiresDetail && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          Détail requis
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">{cat.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCategory(cat)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => cat.id && handleDeleteCategory(cat.id, cat.name)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comptes bancaires */}
      {activeTab === 'banks' && (
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Comptes bancaires</h2>
            <a
              href="/admin/settings/bank-accounts"
              className="text-sm text-blue-600 hover:underline"
            >
              Gérer les comptes (créer, modifier, RIB) →
            </a>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Les comptes eux-mêmes se créent et se modifient dans Finance &gt; Comptes bancaires.
            Ici, tu peux seulement ajuster leur ordre d'affichage dans le journal comptable.
          </p>
          <div className="space-y-2">
            {bankAccounts.length === 0 && (
              <p className="text-sm text-gray-400">Aucun compte bancaire configuré pour l'instant.</p>
            )}
            {bankAccounts.map((bank) => (
              <div key={bank.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                <div>
                  <p className="font-medium">{bank.name}</p>
                  <p className="text-sm text-gray-600">{bank.bank}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Ordre</label>
                  <input
                    type="number"
                    value={orderDrafts[bank.id] ?? bank.sortOrder}
                    onChange={(e) =>
                      setOrderDrafts({ ...orderDrafts, [bank.id]: parseInt(e.target.value) })
                    }
                    className="w-20 px-2 py-1 border rounded-lg"
                  />
                  <button
                    onClick={() => handleSaveOrder(bank.id)}
                    disabled={savingOrderId === bank.id || orderDrafts[bank.id] === bank.sortOrder}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                  >
                    {savingOrderId === bank.id ? '...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comptes traditionnels */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">
              {editingChartId ? 'Modifier le compte' : 'Ajouter un compte'}
            </h2>
            <form onSubmit={handleSaveChartAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Libellé</label>
                <input
                  type="text"
                  value={chartFormData.label}
                  onChange={(e) => setChartFormData({ ...chartFormData, label: e.target.value })}
                  placeholder="Ex: Recettes buvette"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ordre</label>
                <input
                  type="number"
                  value={chartFormData.sortOrder}
                  onChange={(e) => setChartFormData({ ...chartFormData, sortOrder: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
                {editingChartId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingChartId(null);
                      setChartFormData({ label: '', sortOrder: 1 });
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="col-span-2 bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Liste des comptes traditionnels</h2>
            <p className="text-sm text-gray-500 mb-4">
              Liste libre (pas de plan comptable formel) — premier niveau de ventilation des écritures.
            </p>
            <div className="space-y-2">
              {chartAccounts.length === 0 && (
                <p className="text-sm text-gray-400">Aucun compte traditionnel configuré pour l'instant.</p>
              )}
              {chartAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <p className="font-medium">{acc.label}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditChartAccount(acc)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => acc.id && handleDeleteChartAccount(acc.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
