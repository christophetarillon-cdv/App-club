'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import Link from 'next/link';

interface ExcelRow {
  Email?: string;
  Prénom?: string;
  Nom?: string;
  Rôle?: string;
}

interface DancerDraft {
  firstName: string;
  lastName: string;
  role: string;
  error?: string;
}

interface AccountGroup {
  email: string;
  password?: string;
  dancers: DancerDraft[];
  error?: string;
}

type GroupStatus = 'pending' | 'creating' | 'success' | 'error';

interface GroupResult {
  status: GroupStatus;
  message?: string;
  generatedPassword?: string | null;
}

const VALID_ROLES = ['member', 'trial', 'instructor', 'bureau'];

export default function AdminImportDancersPage() {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [results, setResults] = useState<Record<number, GroupResult>>({});
  const [importing, setImporting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileError(null);
    setResults({});
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet!);

      const byEmail = new Map<string, AccountGroup>();

      rows.forEach(row => {
        const email = (row.Email ?? '').toString().trim().toLowerCase();
        const firstName = (row.Prénom ?? '').toString().trim();
        const lastName = (row.Nom ?? '').toString().trim();
        const roleRaw = (row.Rôle ?? '').toString().trim().toLowerCase();

        if (!email) return;

        let group = byEmail.get(email);
        if (!group) {
          group = { email, dancers: [] };
          byEmail.set(email, group);
        }

        const dancer: DancerDraft = { firstName, lastName, role: roleRaw };
        if (!email.includes('@')) dancer.error = 'Email invalide';
        else if (!firstName) dancer.error = 'Prénom manquant';
        else if (!lastName) dancer.error = 'Nom manquant';
        else if (!VALID_ROLES.includes(roleRaw)) dancer.error = `Rôle inconnu (${VALID_ROLES.join(', ')})`;

        group.dancers.push(dancer);
      });

      setGroups(Array.from(byEmail.values()));
    } catch {
      setFileError("Impossible de lire le fichier. Vérifiez le format (colonnes Email, Prénom, Nom, Rôle).");
    }
  };

  const hasErrors = (group: AccountGroup) => group.dancers.some(d => d.error);
  const validGroups = groups.filter(g => !hasErrors(g));

  const handleImport = async () => {
    setImporting(true);
    const call = httpsCallable(functions, 'adminCreateAccount');

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      if (hasErrors(group)) continue;

      setResults(prev => ({ ...prev, [i]: { status: 'creating' } }));
      try {
        const res = await call({
          email: group.email,
          dancers: group.dancers.map(d => ({ firstName: d.firstName, lastName: d.lastName, role: d.role })),
        });
        const data = res.data as { generatedPassword: string | null };
        setResults(prev => ({ ...prev, [i]: { status: 'success', generatedPassword: data.generatedPassword } }));
      } catch (err) {
        const message = (err as { message?: string })?.message ?? "Erreur lors de la création";
        setResults(prev => ({ ...prev, [i]: { status: 'error', message } }));
      }
    }

    setImporting(false);
  };

  const reset = () => {
    setGroups([]);
    setResults({});
    setFileError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/dancers" className="text-sm text-gray-400 hover:text-gray-700">← Danseurs</Link>
        <h1 className="text-2xl font-bold text-gray-900">Import Excel</h1>
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Le fichier doit contenir les colonnes <span className="font-mono">Email</span>, <span className="font-mono">Prénom</span>,
            <span className="font-mono"> Nom</span>, <span className="font-mono">Rôle</span> ({VALID_ROLES.join(', ')}).
            Plusieurs lignes partageant le même email seront regroupées dans un seul compte avec plusieurs danseurs.
            Le mot de passe provisoire sera généré automatiquement (email + nom).
          </p>
          <input
            ref={fileRef}
            type="file" accept=".xlsx,.xls"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="text-sm"
          />
          {fileError && <p className="text-sm text-red-600">{fileError}</p>}
        </div>
      )}

      {groups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {groups.length} compte(s) détecté(s) — {validGroups.length} prêt(s) à importer
              {groups.length !== validGroups.length && (
                <span className="text-red-600"> ({groups.length - validGroups.length} en erreur)</span>
              )}
            </p>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-700 underline">
              Charger un autre fichier
            </button>
          </div>

          <div className="space-y-3">
            {groups.map((group, i) => {
              const result = results[i];
              const invalid = hasErrors(group);
              return (
                <div key={i} className={`bg-white rounded-xl border shadow-sm p-4 ${invalid ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">{group.email}</p>
                    {result?.status === 'success' && (
                      <span className="text-xs text-green-600 font-medium">
                        Créé{result.generatedPassword ? ` — mot de passe : ${result.generatedPassword}` : ''}
                      </span>
                    )}
                    {result?.status === 'error' && <span className="text-xs text-red-600 font-medium">{result.message}</span>}
                    {result?.status === 'creating' && <span className="text-xs text-gray-400">Création…</span>}
                  </div>
                  <div className="space-y-1">
                    {group.dancers.map((d, j) => (
                      <div key={j} className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="text-gray-700">{d.firstName} {d.lastName}</span>
                        <span className="text-gray-400">({d.role || '—'})</span>
                        {d.error && <span className="text-red-500">— {d.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleImport} disabled={importing || validGroups.length === 0 || Object.keys(results).length > 0}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? 'Import en cours…' : `Importer ${validGroups.length} compte(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
