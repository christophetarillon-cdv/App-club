'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface AnalyticsCategory {
  id?: string;
  name: string;
  description: string;
  sortOrder: number;
}

interface BankAccount {
  id?: string;
  code: string;
  label: string;
  sortOrder: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'categories' | 'banks'>('categories');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<AnalyticsCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    code: '',
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

  // Charger les comptes bancaires
  useEffect(() => {
    const q = query(collection(db, 'bankAccounts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: BankAccount[] = [];
      snapshot.forEach((doc) => {
        const docData = doc.data();
        if (docData.isActive !== false) {
          data.push({ id: doc.id, ...docData } as BankAccount);
        }
      });
      setBankAccounts(data.sort((a, b) => a.sortOrder - b.sortOrder));
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
          updatedAt: Date.now(),
        });
      } else {
        await addDoc(collection(db, 'analyticsCategories'), {
          name: formData.name,
          description: formData.description,
          sortOrder: formData.sortOrder,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user?.uid,
        });
      }
      setFormData({ name: '', description: '', code: '', label: '', sortOrder: 1 });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingId) {
        const docRef = doc(db, 'bankAccounts', editingId);
        await updateDoc(docRef, {
          label: formData.label,
          sortOrder: formData.sortOrder,
          updatedAt: Date.now(),
        });
      } else {
        if (!formData.code || !formData.label) {
          setError('Code et libellé sont obligatoires');
          setLoading(false);
          return;
        }
        await addDoc(collection(db, 'bankAccounts'), {
          code: formData.code,
          label: formData.label,
          sortOrder: formData.sortOrder,
          type: 'checking',
          currency: 'EUR',
          isActive: true,
          createdAt: Date.now(),
        });
      }
      setFormData({ name: '', description: '', code: '', label: '', sortOrder: 1 });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
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

  const handleDeleteBank = async (id: string, bankCode: string) => {
    try {
      // Vérifier si le compte est utilisé
      const q = query(collection(db, 'accountingEntries'), where('bankAccount', '==', bankCode));
      const snapshot = await getDocs(q);

      if (snapshot.size > 0) {
        setError(`Impossible de supprimer ce compte : ${snapshot.size} écriture(s) l'utilise(nt)`);
        return;
      }

      if (!confirm('Êtes-vous sûr ?')) return;
      const docRef = doc(db, 'bankAccounts', id);
      await updateDoc(docRef, { isActive: false });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleEditCategory = (cat: AnalyticsCategory) => {
    setEditingId(cat.id || null);
    setFormData({ name: cat.name, description: cat.description, code: '', label: '', sortOrder: cat.sortOrder });
    setActiveTab('categories');
  };

  const handleEditBank = (bank: BankAccount) => {
    setEditingId(bank.id || null);
    setFormData({ name: '', description: '', code: bank.code, label: bank.label, sortOrder: bank.sortOrder });
    setActiveTab('banks');
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
                      setFormData({ name: '', description: '', code: '', label: '', sortOrder: 1 });
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
                    <p className="font-medium">{cat.name}</p>
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
        <div className="grid grid-cols-3 gap-6">
          {/* Formulaire */}
          <div className="bg-white p-6 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? 'Modifier le compte' : 'Ajouter un compte'}
            </h2>
            <form onSubmit={handleSaveBank} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="CE_PRINCIPAL"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Libellé</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Caisse Épargne Principale"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
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
                      setFormData({ name: '', description: '', code: '', label: '', sortOrder: 1 });
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
            <h2 className="text-lg font-semibold mb-4">Liste des comptes bancaires</h2>
            <div className="space-y-2">
              {bankAccounts.map((bank) => (
                <div key={bank.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border">
                  <div>
                    <p className="font-medium">{bank.label}</p>
                    <p className="text-sm text-gray-600">Code: {bank.code}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditBank(bank)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => bank.id && handleDeleteBank(bank.id, bank.code)}
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
