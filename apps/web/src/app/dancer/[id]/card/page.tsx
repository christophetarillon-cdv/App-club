'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/AppShell';
import { useRoles } from '@/hooks/useRoles';
import QRCode from 'react-qr-code';

export default function DancerCardPage() {
  const { getLabel } = useRoles();
  const { dancers, loading } = useAuth();
  const router = useRouter();
  const [activeIdx, setActiveIdx] = useState(0);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (dancers.length === 0) {
    router.replace('/select-dancer');
    return null;
  }

  const dancer = dancers[Math.min(activeIdx, dancers.length - 1)]!;
  const palette = ['bg-blue-500','bg-purple-500','bg-pink-500','bg-green-500','bg-orange-500','bg-teal-500'];
  const color = palette[(dancer.firstName.charCodeAt(0) + dancer.lastName.charCodeAt(0)) % palette.length];
  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #7FBFE3 33%, #D8EAF3 66%, #F9F7F4 100%)',
      }}>
        <div className="max-w-sm mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Ma carte</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-sm mx-auto px-4 pb-6 -mt-4 relative space-y-4">

        {/* Sélecteur de danseur (si plusieurs) */}
        {dancers.length > 1 && (
          <div className="flex gap-2">
            {dancers.map((d, i) => (
              <button key={d.id} onClick={() => setActiveIdx(i)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  i === activeIdx
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {d.photoUrl
                  ? <img src={d.photoUrl} alt="" className="w-6 h-6 rounded-lg object-cover" />
                  : <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${
                      palette[(d.firstName.charCodeAt(0) + d.lastName.charCodeAt(0)) % palette.length]
                    }`}>{`${d.firstName[0] ?? ''}${d.lastName[0] ?? ''}`.toUpperCase()}</span>
                }
                {d.firstName}
              </button>
            ))}
          </div>
        )}

        {/* Carte membre */}
        <div className="bg-primary rounded-2xl p-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-white/50 text-[10px] uppercase tracking-widest">Club de Danse Voiron</p>
              <p className="text-white/70 text-xs mt-0.5">Carte de membre</p>
            </div>
            <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
              <span className="text-white font-bold text-xs">{initials}</span>
            </div>
          </div>
          <p className="text-white text-lg font-semibold">{dancer.firstName} {dancer.lastName}</p>
          {dancer.memberNumber && (
            <p className="text-white/40 font-mono text-[11px] mt-0.5">{dancer.memberNumber}</p>
          )}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {dancer.roles.map(r => (
              <span key={r} className="text-[10px] bg-white/15 text-white/80 px-2 py-0.5 rounded-full capitalize">
                {getLabel(r)}
              </span>
            ))}
          </div>
        </div>

        {/* QR code */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col items-center gap-4">
          <p className="text-sm font-medium text-gray-700">QR code de pointage</p>
          <div className="p-3 bg-white rounded-xl border border-gray-100">
            <QRCode value={dancer.id} size={180} fgColor="#111827" bgColor="#ffffff" />
          </div>
          <p className="text-xs text-gray-400 text-center">
            Présentez ce code à l'accueil pour pointer votre présence.
          </p>
        </div>

      </div>
    </AppShell>
  );
}
