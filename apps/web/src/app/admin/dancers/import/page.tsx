'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import Link from 'next/link';

interface RoleOption { key: string; label: string; }

type ExcelRow = Record<string, unknown>;

// Les en-têtes accentués peuvent être encodés différemment selon l'outil qui a
// généré le fichier (formes Unicode composée/décomposée, casse, espaces) —
// on normalise avant de comparer pour ne pas rater une colonne à cause de ça.
function normalizeHeader(h: string): string {
  return h.normalize('NFC').trim().toLowerCase();
}

function getRawCell(row: ExcelRow, ...names: string[]): unknown {
  const targets = names.map(normalizeHeader);
  const key = Object.keys(row).find(k => targets.includes(normalizeHeader(k)));
  return key ? row[key] : undefined;
}

function getCell(row: ExcelRow, ...names: string[]): string {
  const v = getRawCell(row, ...names);
  return v === undefined || v === null ? '' : v.toString().trim();
}

interface DancerDraft {
  firstName: string;
  lastName: string;
  role: string;
  birthDate?: string;
  gender?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  error?: string;
}

interface AccountGroup {
  email: string;
  phone?: string;
  password?: string;
  dancers: DancerDraft[];
  error?: string;
}

function parseExcelDate(value: string | number | Date | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = value.toString().trim();
  if (!str) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parts = str.split(/[/\-.]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d && m && y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return undefined;
}

// L'app mobile (GenderPicker) stocke des codes anglais ('male'/'female')
// et compare par egalite stricte pour savoir quelle puce est selectionnee — un
// mot francais stocke tel quel (ex: "Femme") n'y correspond a rien et
// n'apparait donc pas comme selectionne. On normalise vers ces codes ici.
function normalizeGender(raw: string): string | undefined {
  const lower = raw.trim().toLowerCase();
  if (!lower) return undefined;
  if (['homme', 'h', 'male', 'm', 'garcon', 'garçon'].includes(lower)) return 'male';
  if (['femme', 'f', 'female', 'fille'].includes(lower)) return 'female';
  return undefined;
}

type GroupStatus = 'pending' | 'creating' | 'success' | 'error';

interface GroupResult {
  status: GroupStatus;
  message?: string;
  generatedPassword?: string | null;
}

export default function AdminImportDancersPage() {
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [results, setResults] = useState<Record<number, GroupResult>>({});
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'roles'), orderBy('displayOrder'))).then(snap => {
      setRoleOptions(snap.docs.map(d => ({ key: d.data().key, label: d.data().label })).filter(r => r.key !== 'admin'));
    });
  }, []);

  const resolveRole = (raw: string): string | null => {
    const lower = raw.toLowerCase();
    const match = roleOptions.find(r => r.key.toLowerCase() === lower || r.label.toLowerCase() === lower);
    return match?.key ?? null;
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setFileError(null);
    setResults({});
    setAnalyzing(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet!);

      const byEmail = new Map<string, AccountGroup>();

      rows.forEach(row => {
        const email = getCell(row, 'Email').toLowerCase();
        const firstName = getCell(row, 'Prénom', 'Prenom');
        const lastName = getCell(row, 'Nom');
        const roleRaw = getCell(row, 'Rôle', 'Role');
        const resolvedRole = resolveRole(roleRaw);
        const phone = getCell(row, 'Téléphone', 'Telephone');
        const birthDate = parseExcelDate(getRawCell(row, 'Date de naissance') as string | number | Date | undefined);
        const gender = normalizeGender(getCell(row, 'Genre'));
        const street = getCell(row, 'Rue');
        const postalCode = getCell(row, 'Code postal');
        const city = getCell(row, 'Ville');
        const emergencyContactName = getCell(row, 'Contact urgence (nom)');
        const emergencyContactPhone = getCell(row, 'Contact urgence (téléphone)', 'Contact urgence (telephone)');

        if (!email) return;

        let group = byEmail.get(email);
        if (!group) {
          group = { email, dancers: [] };
          byEmail.set(email, group);
        }
        if (phone && !group.phone) group.phone = phone;

        const dancer: DancerDraft = {
          firstName, lastName, role: resolvedRole ?? roleRaw,
          ...(birthDate ? { birthDate } : {}),
          ...(gender ? { gender } : {}),
          ...(street ? { street } : {}),
          ...(postalCode ? { postalCode } : {}),
          ...(city ? { city } : {}),
          ...(emergencyContactName ? { emergencyContactName } : {}),
          ...(emergencyContactPhone ? { emergencyContactPhone } : {}),
        };
        const roleNames = roleOptions.map(r => r.label).join(', ');
        if (!email.includes('@')) dancer.error = 'Email invalide';
        else if (!firstName) dancer.error = 'Prénom manquant';
        else if (!lastName) dancer.error = 'Nom manquant';
        else if (!resolvedRole) dancer.error = `Rôle inconnu (${roleNames})`;

        group.dancers.push(dancer);
      });

      if (rows.length === 0) {
        setFileError("Le fichier ne contient aucune ligne de données (au-delà de l'en-tête).");
      } else if (byEmail.size === 0) {
        setFileError("Aucune ligne exploitable : vérifiez que la première ligne du fichier contient bien les en-têtes Email, Prénom, Nom, Rôle.");
      }

      setGroups(Array.from(byEmail.values()));
    } catch {
      setFileError("Impossible de lire le fichier. Vérifiez le format (colonnes Email, Prénom, Nom, Rôle).");
    } finally {
      setAnalyzing(false);
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
          ...(group.phone ? { phone: group.phone } : {}),
          dancers: group.dancers.map(d => ({
            firstName: d.firstName, lastName: d.lastName, role: d.role,
            ...(d.birthDate ? { birthDate: d.birthDate } : {}),
            ...(d.gender ? { gender: d.gender } : {}),
            ...(d.street ? { street: d.street } : {}),
            ...(d.postalCode ? { postalCode: d.postalCode } : {}),
            ...(d.city ? { city: d.city } : {}),
            ...(d.emergencyContactName ? { emergencyContactName: d.emergencyContactName } : {}),
            ...(d.emergencyContactPhone ? { emergencyContactPhone: d.emergencyContactPhone } : {}),
          })),
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
    setSelectedFile(null);
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
            La première ligne du fichier doit contenir les en-têtes de colonnes, dans cet ordre :
          </p>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-0.5">
            <li><span className="font-mono">Email</span> — obligatoire</li>
            <li><span className="font-mono">Prénom</span> — obligatoire</li>
            <li><span className="font-mono">Nom</span> — obligatoire</li>
            <li><span className="font-mono">Rôle</span> — obligatoire ({roleOptions.map(r => r.label).join(', ') || '…'})</li>
            <li><span className="font-mono">Téléphone</span> — facultatif</li>
            <li><span className="font-mono">Date de naissance</span> — facultatif</li>
            <li><span className="font-mono">Genre</span> — facultatif (Homme/Femme)</li>
            <li><span className="font-mono">Rue</span> — facultatif</li>
            <li><span className="font-mono">Code postal</span> — facultatif</li>
            <li><span className="font-mono">Ville</span> — facultatif</li>
            <li><span className="font-mono">Contact urgence (nom)</span> — facultatif</li>
            <li><span className="font-mono">Contact urgence (téléphone)</span> — facultatif</li>
          </ol>
          <p className="text-sm text-gray-600">
            Laissez une cellule vide si l'information n'est pas disponible. Plusieurs lignes partageant le même email
            seront regroupées dans un seul compte avec plusieurs danseurs. Le mot de passe provisoire sera généré
            automatiquement (email + nom).
          </p>
          <input
            ref={fileRef}
            type="file" accept=".xlsx,.xls"
            onChange={e => { const f = e.target.files?.[0] ?? null; setSelectedFile(f); setFileError(null); }}
            className="text-sm"
          />
          {selectedFile && (
            <button
              onClick={handleAnalyze} disabled={analyzing}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {analyzing ? 'Analyse…' : 'Analyser le fichier'}
            </button>
          )}
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
