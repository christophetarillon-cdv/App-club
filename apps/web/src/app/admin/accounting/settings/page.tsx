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
  type?: 'charge' | 'produit';
  group?: string;
}

interface CategoryDetail {
  id?: string;
  categoryName: string;
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
  const [categoryDetails, setCategoryDetails] = useState<CategoryDetail[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
  const [expandedDetailsFor, setExpandedDetailsFor] = useState<string | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, number>>({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sortOrder: 1,
    requiresDetail: false,
  });

  const [chartFormData, setChartFormData] = useState<{ label: string; sortOrder: number; type: 'charge' | 'produit' | ''; group: string }>({
    label: '',
    sortOrder: 1,
    type: '',
    group: '',
  });

  const [detailFormData, setDetailFormData] = useState({
    categoryName: '',
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

  // Charger les détails (niveau 3) de chaque catégorie qui l'exige
  useEffect(() => {
    const q = query(collection(db, 'analyticsCategoryDetails'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: CategoryDetail[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({
            id: doc.id,
            categoryName: docData.categoryName ?? '',
            label: docData.label ?? '',
            sortOrder: docData.sortOrder ?? 999,
          });
        }
      });
      setCategoryDetails(data.sort((a, b) => a.sortOrder - b.sortOrder));
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
          data.push({ id: doc.id, label: docData.label ?? '', sortOrder: docData.sortOrder ?? 999, type: docData.type, group: docData.group });
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
    setError('');

    if (!chartFormData.type) {
      setError('Le type (Charge ou Produit) est obligatoire');
      return;
    }

    setLoading(true);
    try {
      if (editingChartId) {
        await updateDoc(doc(db, 'chartOfAccounts', editingChartId), {
          label: chartFormData.label,
          sortOrder: chartFormData.sortOrder,
          type: chartFormData.type,
          group: chartFormData.group || null,
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, 'chartOfAccounts'), {
          label: chartFormData.label,
          sortOrder: chartFormData.sortOrder,
          type: chartFormData.type,
          group: chartFormData.group || null,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user?.uid,
        });
      }
      setChartFormData({ label: '', sortOrder: 1, type: '', group: '' });
      setEditingChartId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChartAccount = (acc: ChartAccount) => {
    setEditingChartId(acc.id || null);
    setChartFormData({ label: acc.label, sortOrder: acc.sortOrder, type: acc.type ?? '', group: acc.group ?? '' });
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

  const handleSaveDetail = async (e: React.FormEvent, categoryName: string) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingDetailId) {
        await updateDoc(doc(db, 'analyticsCategoryDetails', editingDetailId), {
          label: detailFormData.label,
          sortOrder: detailFormData.sortOrder,
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, 'analyticsCategoryDetails'), {
          categoryName,
          label: detailFormData.label,
          sortOrder: detailFormData.sortOrder,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user?.uid,
        });
      }
      setDetailFormData({ categoryName: '', label: '', sortOrder: 1 });
      setEditingDetailId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleEditDetail = (detail: CategoryDetail) => {
    setEditingDetailId(detail.id || null);
    setDetailFormData({ categoryName: detail.categoryName, label: detail.label, sortOrder: detail.sortOrder });
  };

  const handleDeleteDetail = async (id: string) => {
    try {
      if (!confirm('Êtes-vous sûr ?')) return;
      await updateDoc(doc(db, 'analyticsCategoryDetails', id), { isActive: false });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
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
                Nécessite un détail (liste à choisir) lors de la ventilation
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
              {categories.map((cat) => {
                const details = categoryDetails.filter((d) => d.categoryName === cat.name);
                const isExpanded = expandedDetailsFor === cat.name;
                return (
                  <div key={cat.id} className="bg-gray-50 rounded border">
                    <div className="flex items-center justify-between p-3">
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
                        {cat.requiresDetail && (
                          <button
                            onClick={() => {
                              setExpandedDetailsFor(isExpanded ? null : cat.name);
                              setEditingDetailId(null);
                              setDetailFormData({ categoryName: cat.name, label: '', sortOrder: 1 });
                            }}
                            className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm font-medium hover:bg-purple-200"
                          >
                            Gérer les détails ({details.length})
                          </button>
                        )}
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

                    {isExpanded && (
                      <div className="border-t bg-white p-3 space-y-3">
                        <form
                          onSubmit={(e) => handleSaveDetail(e, cat.name)}
                          className="flex items-end gap-2"
                        >
                          <div className="flex-1">
                            <label className="block text-xs font-medium mb-1">Libellé</label>
                            <input
                              type="text"
                              value={detailFormData.label}
                              onChange={(e) => setDetailFormData({ ...detailFormData, label: e.target.value })}
                              placeholder="Ex: Recette chèque"
                              className="w-full px-2 py-1.5 border rounded text-sm"
                              required
                            />
                          </div>
                          <div className="w-20">
                            <label className="block text-xs font-medium mb-1">Ordre</label>
                            <input
                              type="number"
                              value={detailFormData.sortOrder}
                              onChange={(e) => setDetailFormData({ ...detailFormData, sortOrder: parseInt(e.target.value) })}
                              className="w-full px-2 py-1.5 border rounded text-sm"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={loading}
                            className="px-3 py-1.5 bg-purple-500 text-white rounded text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
                          >
                            {editingDetailId ? 'Mettre à jour' : 'Ajouter'}
                          </button>
                          {editingDetailId && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDetailId(null);
                                setDetailFormData({ categoryName: cat.name, label: '', sortOrder: 1 });
                              }}
                              className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-400"
                            >
                              Annuler
                            </button>
                          )}
                        </form>

                        <div className="space-y-1">
                          {details.length === 0 && (
                            <p className="text-sm text-gray-400">Aucun détail configuré pour l'instant.</p>
                          )}
                          {details.map((d) => (
                            <div key={d.id} className="flex items-center justify-between px-2 py-1.5 bg-gray-50 rounded text-sm">
                              <span>{d.label}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditDetail(d)}
                                  className="text-blue-600 hover:underline text-xs font-medium"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => d.id && handleDeleteDetail(d.id)}
                                  className="text-red-600 hover:underline text-xs font-medium"
                                >
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChartFormData({ ...chartFormData, type: 'charge' })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                      chartFormData.type === 'charge' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Charge
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartFormData({ ...chartFormData, type: 'produit' })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                      chartFormData.type === 'produit' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Produit
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Groupe (facultatif)</label>
                <input
                  type="text"
                  value={chartFormData.group}
                  onChange={(e) => setChartFormData({ ...chartFormData, group: e.target.value })}
                  placeholder="Ex: Activités courantes"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Comptes partageant le même groupe : sous-total dédié dans l'export "Compte de résultat".
                  Laisser vide si tu n'as pas besoin de sous-totaux.
                </p>
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
                      setChartFormData({ label: '', sortOrder: 1, type: '', group: '' });
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
                  <p className="font-medium">
                    {acc.label}
                    {acc.type === 'charge' && (
                      <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Charge</span>
                    )}
                    {acc.type === 'produit' && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Produit</span>
                    )}
                    {!acc.type && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Non typé</span>
                    )}
                    {acc.group && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{acc.group}</span>
                    )}
                  </p>
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
