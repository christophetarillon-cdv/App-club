'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import type { Dancer } from '@cdv/types';

function Avatar({ dancer, size = 'lg' }: { dancer: Dancer; size?: 'lg' | 'sm' }) {
  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500',
    'bg-orange-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
  ];
  const color = colors[(dancer.firstName.charCodeAt(0) + dancer.lastName.charCodeAt(0)) % colors.length];
  const sizeClass = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-10 h-10 text-sm';

  if (dancer.photoUrl) {
    return <img src={dancer.photoUrl} alt={dancer.firstName} className={`${sizeClass} rounded-2xl object-cover`} />;
  }
  return (
    <div className={`${sizeClass} ${color} rounded-2xl flex items-center justify-center font-bold text-white`}>
      {initials}
    </div>
  );
}

const Spinner = () => (
  <div className="min-h-screen bg-gray-950 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);

export default function SelectDancerPage() {
  const { user, dancers, loading } = useAuth();
  const { selectDancer } = useDancer();
  const router = useRouter();
  // Ne passe à true que si on doit afficher le picker (plusieurs danseurs)
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (dancers.length === 1) {
      selectDancer(dancers[0]!);
      router.replace(`/dancer/${dancers[0]!.id}`);
      return;
    }
    // Plusieurs danseurs (ou 0) : afficher le picker
    setShowPicker(true);
  }, [loading, user, dancers.length]);

  const handleSelect = (dancer: Dancer) => {
    selectDancer(dancer);
    router.push(`/dancer/${dancer.id}`);
  };

  if (!showPicker) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Club de Danse Voiron</p>
          <h1 className="text-white text-3xl font-bold">Qui danse ?</h1>
        </div>

        {dancers.length === 0 ? (
          <div className="text-center text-white/40 py-8">
            <p>Aucun danseur enregistré.</p>
            <a href="/profile" className="text-blue-400 text-sm mt-3 inline-block hover:underline">
              Aller au profil →
            </a>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2">
            {dancers.map(dancer => (
              <button
                key={dancer.id}
                onClick={() => handleSelect(dancer)}
                className="group flex flex-col items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-2xl p-6 transition-all duration-200 hover:scale-[1.02]"
              >
                <Avatar dancer={dancer} size="lg" />
                <div className="text-center">
                  <p className="text-white font-semibold text-base">{dancer.firstName}</p>
                  <p className="text-white/50 text-sm">{dancer.lastName}</p>
                </div>
                {dancer.roles.includes('trial') && (
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                    Essai
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <a href="/profile" className="text-white/30 hover:text-white/60 text-sm transition-colors">
            Paramètres du compte
          </a>
        </div>
      </div>
    </div>
  );
}
