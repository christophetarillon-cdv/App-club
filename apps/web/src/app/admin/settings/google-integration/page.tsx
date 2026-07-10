'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';

const DEFAULT_GROUP_GLOBAL = 'Tous les danseurs';
const DEFAULT_GROUP_SEASON_TEMPLATE = 'Danseurs {season}';

interface GoogleIntegrationSettings {
  connected: boolean;
  connectedEmail: string | null;
  groupNameGlobal: string;
  groupNameSeasonTemplate: string;
  autoSyncEnabled: boolean;
  senderDisplayName: string;
  defaultReplyTo: string;
}

function GoogleIntegrationPageInner() {
  const params = useSearchParams();
  const [settings, setSettings] = useState<GoogleIntegrationSettings>({
    connected: false,
    connectedEmail: null,
    groupNameGlobal: DEFAULT_GROUP_GLOBAL,
    groupNameSeasonTemplate: DEFAULT_GROUP_SEASON_TEMPLATE,
    autoSyncEnabled: false,
    senderDisplayName: '',
    defaultReplyTo: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = () => {
    setLoading(true);
    getDoc(doc(db, 'appSettings', 'googleIntegration')).then(snap => {
      const data = snap.data() ?? {};
      setSettings(s => ({
        ...s,
        connected: data.connected ?? false,
        connectedEmail: data.connectedEmail ?? null,
        groupNameGlobal: data.groupNameGlobal ?? DEFAULT_GROUP_GLOBAL,
        groupNameSeasonTemplate: data.groupNameSeasonTemplate ?? DEFAULT_GROUP_SEASON_TEMPLATE,
        autoSyncEnabled: data.autoSyncEnabled ?? false,
        senderDisplayName: data.senderDisplayName ?? '',
        defaultReplyTo: data.defaultReplyTo ?? '',
      }));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (params.get('connected') === '1' || params.get('connected') === '0') {
      // Recharge après le retour du flux OAuth (succès ou échec).
      load();
    }
  }, [params]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const fn = httpsCallable<void, { url: string }>(functions, 'getGoogleAuthUrl');
      const res = await fn();
      window.location.href = res.data.url;
    } catch (err) {
      console.error('getGoogleAuthUrl failed:', err);
      alert('Impossible de démarrer la connexion Google.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Déconnecter le compte Google ? La synchronisation des contacts et l\'envoi d\'emails seront désactivés.')) return;
    setDisconnecting(true);
    try {
      await httpsCallable(functions, 'disconnectGoogleAccount')();
      load();
    } catch (err) {
      console.error('disconnectGoogleAccount failed:', err);
      alert('La déconnexion a échoué.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    await setDoc(doc(db, 'appSettings', 'googleIntegration'), {
      groupNameGlobal: settings.groupNameGlobal,
      groupNameSeasonTemplate: settings.groupNameSeasonTemplate,
      autoSyncEnabled: settings.autoSyncEnabled,
      senderDisplayName: settings.senderDisplayName,
      defaultReplyTo: settings.defaultReplyTo,
    }, { merge: true });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Intégration Google</h1>
      <p className="text-sm text-gray-500 mb-6">
        Synchronise automatiquement les danseurs vers des groupes de contacts Google et permet
        l'envoi d'emails depuis l'application, via un compte Gmail connecté.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {params.get('connected') === '0' && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              La connexion a échoué. Réessaie.
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Compte Google</h2>
            {settings.connected ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700">Connecté</p>
                  <p className="text-sm font-medium text-gray-900">{settings.connectedEmail}</p>
                </div>
                <button onClick={handleDisconnect} disabled={disconnecting}
                  className="text-sm text-red-600 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50">
                  {disconnecting ? 'Déconnexion…' : 'Déconnecter'}
                </button>
              </div>
            ) : (
              <button onClick={handleConnect} disabled={connecting}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {connecting ? 'Redirection…' : 'Connecter un compte Google'}
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-800">Groupes de contacts</h2>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">Nom du groupe global</label>
              <input type="text" value={settings.groupNameGlobal}
                onChange={e => setSettings(s => ({ ...s, groupNameGlobal: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">Nom du groupe par saison</label>
              <input type="text" value={settings.groupNameSeasonTemplate}
                onChange={e => setSettings(s => ({ ...s, groupNameSeasonTemplate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              <p className="text-xs text-gray-400 mt-1">{'{season}'} est remplacé par le libellé de la saison (ex. "2026-2027").</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={settings.autoSyncEnabled}
                onChange={e => setSettings(s => ({ ...s, autoSyncEnabled: e.target.checked }))} />
              Synchronisation automatique activée
            </label>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
            <h2 className="text-sm font-semibold text-gray-800">Envoi d'emails</h2>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">Nom d'expéditeur affiché</label>
              <input type="text" value={settings.senderDisplayName}
                onChange={e => setSettings(s => ({ ...s, senderDisplayName: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">Adresse de réponse (reply-to)</label>
              <input type="email" value={settings.defaultReplyTo}
                onChange={e => setSettings(s => ({ ...s, defaultReplyTo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>

          {saved && <p className="text-sm text-green-600">Enregistré.</p>}

          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function GoogleIntegrationSettingsPage() {
  return (
    <Suspense fallback={null}>
      <GoogleIntegrationPageInner />
    </Suspense>
  );
}
