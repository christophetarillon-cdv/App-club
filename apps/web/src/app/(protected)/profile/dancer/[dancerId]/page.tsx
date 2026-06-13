'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { updateDancer } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import type { Dancer } from '@cdv/types';

const roleLabel: Record<string, string> = {
  member: 'Membre',
  trial: 'Essai',
  instructor: 'Moniteur',
};

function formatDate(ts: { seconds: number } | undefined): string {
  if (!ts) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString('fr-FR');
}

export default function DancerProfilePage() {
  const params = useParams();
  const dancerId = typeof params.dancerId === 'string' ? params.dancerId : (params.dancerId?.[0] ?? '');
  const { account, dancers, loading: authLoading } = useAuth();
  const router = useRouter();

  const dancer: Dancer | undefined = dancers.find(d => d.id === dancerId);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (dancer) {
      setFirstName(dancer.firstName);
      setLastName(dancer.lastName);
      setPhone(dancer.phone ?? '');
      setAddress(dancer.address ?? '');
      setEmergencyName(dancer.emergencyContact?.name ?? '');
      setEmergencyPhone(dancer.emergencyContact?.phone ?? '');
      setPhotoPreview(dancer.photoUrl ?? null);
    }
  }, [dancer]);

  useEffect(() => {
    if (!authLoading && !dancer) {
      router.replace('/profile');
    }
  }, [authLoading, dancer, router]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) setPhotoPreview(URL.createObjectURL(file));
  };

  const handlePhotoUpload = async () => {
    if (!photoFile || !dancer) return;
    setUploadingPhoto(true); setPhotoError(null);
    try {
      const storageRef = ref(storage, `profile-photos/${dancer.id}/photo.jpg`);
      await uploadBytes(storageRef, photoFile);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDancer(dancer.id, { photoUrl: downloadUrl });
      setPhotoFile(null);
    } catch {
      setPhotoError('Erreur lors du téléchargement.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dancer) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updateDancer(dancer.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        emergencyContact: (emergencyName.trim() || emergencyPhone.trim())
          ? { name: emergencyName.trim(), phone: emergencyPhone.trim() }
          : undefined,
      });
      setSaved(true);
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !dancer) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement…</div>;
  }

  const isAdmin = dancer.roles.includes('admin');
  const isTrial = dancer.roles.includes('trial');

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto pt-8 space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 -ml-1 rounded-lg hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{dancer.firstName} {dancer.lastName}</h1>
            <div className="flex gap-1 mt-0.5">
              {dancer.roles.map(r => (
                <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r === 'trial' ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {roleLabel[r] ?? r}
                </span>
              ))}
              {dancer.memberNumber && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                  {dancer.memberNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Photo de profil */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Photo de profil</h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0">
              {photoPreview
                ? <img src={photoPreview} alt="Photo" className="w-full h-full object-cover" />
                : <span className="text-blue-700 font-bold text-2xl">{dancer.firstName[0]}{dancer.lastName[0]}</span>
              }
            </div>
            <div className="flex-1 space-y-2">
              <input type="file" accept="image/*" onChange={handlePhotoChange}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
              {photoFile && (
                <button onClick={handlePhotoUpload} disabled={uploadingPhoto}
                  className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors">
                  {uploadingPhoto ? 'Téléchargement…' : 'Enregistrer la photo'}
                </button>
              )}
              {photoError && <p className="text-red-600 text-xs">{photoError}</p>}
            </div>
          </div>
        </div>

        {/* Formulaire infos */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Informations</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prénom</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Téléphone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Adresse</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none" />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact d'urgence</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom</label>
                <input type="text" value={emergencyName} onChange={e => setEmergencyName(e.target.value)}
                  placeholder="Prénom Nom"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Téléphone</label>
                <input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Statut</label>
            <p className="text-sm text-gray-700">{dancer.isActive ? 'Actif' : 'Inactif'}</p>
          </div>

          {isTrial && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Période d'essai</p>
              <div className="grid grid-cols-2 gap-2 text-sm text-amber-900">
                <div>
                  <span className="text-xs text-amber-600">Début</span>
                  <p>{formatDate(dancer.trialStartDate as any)}</p>
                </div>
                <div>
                  <span className="text-xs text-amber-600">Expiration</span>
                  <p>{formatDate(dancer.trialExpiresAt as any)}</p>
                </div>
              </div>
              {dancer.trialSessionsUsed !== undefined && (
                <p className="text-xs text-amber-700">
                  {dancer.trialSessionsUsed} séance{dancer.trialSessionsUsed > 1 ? 's' : ''} utilisée{dancer.trialSessionsUsed > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {saved && <p className="text-green-600 text-sm">Modifications enregistrées.</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
            {saving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </form>

        {/* Accès administration */}
        {isAdmin && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Administration</h2>
            <p className="text-xs text-gray-400">Ce compte a les droits d'administration du club.</p>
            <div className="space-y-2">
              {[
                { href: '/admin/club-settings', label: 'Paramètres du club' },
                { href: '/admin/seasons', label: 'Saisons' },
                { href: '/admin/settings/trial', label: 'Paramètres essai' },
                { href: '/admin/settings/welcome-qr', label: "QR d'accueil" },
              ].map(({ href, label }) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <span className="text-sm font-medium text-gray-800">{label}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
