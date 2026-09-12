'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface Entry {
  id: string;
  date: number;
  description: string;
  amount?: number;
  type?: 'expense' | 'income';
  debit?: { accountCode: string; amount: number };
  credit?: { accountCode: string; amount: number };
  bankAccount: string;
  analyticsCategory?: string;
  reconciled: boolean;
  status: 'draft' | 'posted';
}

interface EntryTableProps {
  entries: Entry[];
  loading: boolean;
  seasonId: string;
}

const BANK_LABELS: Record<string, string> = {
  CE_PRINCIPAL: 'CE Principale',
  CE_LIVRET: 'CE Livret',
  PAYPAL: 'PayPal',
  STRIPE: 'Stripe',
  CAISSE: 'Caisse',
};

export default function EntryTable({ entries, loading, seasonId }: EntryTableProps) {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Entry>>({});
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditingData({ ...entry });
  };

  const handleSave = async () => {
    if (!editingId) return;

    setSaving(true);
    try {
      const entryRef = doc(db, 'accountingEntries', editingId);
      await updateDoc(entryRef, {
        description: editingData.description,
        amount: editingData.amount,
        date: editingData.date,
        bankAccount: editingData.bankAccount,
        analyticsCategory: editingData.analyticsCategory,
      });
      setEditingId(null);
      setEditingData({});
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReconciled = async (entry: Entry) => {
    if (!user) return;

    setTogglingId(entry.id);
    try {
      const entryRef = doc(db, 'accountingEntries', entry.id);
      await updateDoc(entryRef, {
        reconciled: !entry.reconciled,
      });
    } catch (err) {
      console.error('Erreur lors du pointage:', err);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        Chargement des écritures...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        Aucune écriture pour la saison {seasonId}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-center font-semibold w-10">✓</th>
            <th className="px-6 py-3 text-left font-semibold">Date</th>
            <th className="px-6 py-3 text-left font-semibold">Libellé</th>
            <th className="px-6 py-3 text-right font-semibold">Montant</th>
            <th className="px-6 py-3 text-center font-semibold">Type</th>
            <th className="px-6 py-3 text-left font-semibold">Compte</th>
            <th className="px-6 py-3 text-left font-semibold">Catégorie</th>
            <th className="px-6 py-3 text-center font-semibold">État</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <>
              <tr
                key={entry.id}
                className={`border-b transition ${
                  entry.reconciled
                    ? 'bg-green-50 hover:bg-green-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-6 py-4 text-center">
                  <input
                    type="checkbox"
                    checked={entry.reconciled}
                    onChange={() => handleToggleReconciled(entry)}
                    disabled={togglingId === entry.id}
                    className="w-4 h-4 cursor-pointer"
                  />
                </td>
                <td
                  className="px-6 py-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  {new Date(entry.date).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-6 py-4 font-medium">
                  {entry.description.length > 30
                    ? entry.description.substring(0, 30) + '...'
                    : entry.description}
                </td>
                <td className={`px-6 py-4 text-right font-mono ${
                  entry.type === 'expense' ? 'text-red-600' : entry.type === 'income' ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {entry.amount !== undefined
                    ? `${entry.type === 'expense' ? '-' : '+'} ${entry.amount.toFixed(2)} €`
                    : `${entry.debit?.amount.toFixed(2) || 0} / ${entry.credit?.amount.toFixed(2) || 0} €`}
                </td>
                <td className="px-6 py-4 text-center">
                  {entry.type && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      entry.type === 'expense'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {entry.type === 'expense' ? 'Dépense' : 'Recette'}
                    </span>
                  )}
                  {!entry.type && <span className="text-xs text-gray-500">Ancienne</span>}
                </td>
                <td className="px-6 py-4">
                  {BANK_LABELS[entry.bankAccount] || entry.bankAccount}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {entry.analyticsCategory || '-'}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    entry.status === 'posted'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {entry.status === 'posted' ? 'Validée' : 'Brouillon'}
                  </span>
                </td>
              </tr>

              {expandedId === entry.id && (
                <tr className="bg-blue-50 border-b">
                  <td colSpan={7} className="px-6 py-4">
                    {editingId === entry.id ? (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                          <input
                            type="text"
                            value={editingData.description || ''}
                            onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                            className="w-full px-3 py-2 border rounded text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Date</label>
                            <input
                              type="date"
                              value={new Date(editingData.date || 0).toISOString().split('T')[0]}
                              onChange={(e) => setEditingData({ ...editingData, date: new Date(e.target.value).getTime() })}
                              className="w-full px-3 py-2 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Montant</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editingData.amount || ''}
                              onChange={(e) => setEditingData({ ...editingData, amount: parseFloat(e.target.value) })}
                              className="w-full px-3 py-2 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Compte</label>
                            <select
                              value={editingData.bankAccount || ''}
                              onChange={(e) => setEditingData({ ...editingData, bankAccount: e.target.value })}
                              className="w-full px-3 py-2 border rounded text-sm"
                            >
                              {Object.entries(BANK_LABELS).map(([code, label]) => (
                                <option key={code} value={code}>{label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Catégorie</label>
                          <input
                            type="text"
                            value={editingData.analyticsCategory || ''}
                            onChange={(e) => setEditingData({ ...editingData, analyticsCategory: e.target.value })}
                            className="w-full px-3 py-2 border rounded text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                          >
                            {saving ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-400"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Description complète</p>
                          <p className="text-sm">{entry.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-gray-600">Compte bancaire</p>
                            <p className="text-sm">{BANK_LABELS[entry.bankAccount] || entry.bankAccount}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-600">Montant</p>
                            <p className={`text-sm font-mono ${
                              entry.type === 'expense' ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {entry.type === 'expense' ? '-' : '+'}{entry.amount?.toFixed(2) || '0.00'} €
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Catégorie analytique</p>
                          <p className="text-sm">{entry.analyticsCategory || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600">Pointé</p>
                          <p className="text-sm">{entry.reconciled ? 'Pointé' : 'Non pointé'}</p>
                        </div>
                        <button
                          onClick={() => handleEdit(entry)}
                          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600"
                        >
                          Modifier
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
