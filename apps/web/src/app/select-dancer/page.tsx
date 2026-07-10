'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
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
  const sizeClass = size === 'lg' ? 'w-[72px] h-[72px] text-2xl' : 'w-10 h-10 text-sm';

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
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
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
    <div className="min-h-screen bg-background flex flex-col">
      <div className="relative overflow-hidden pb-14 px-6 pt-10" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #2F86C0 45%, #7FBFE3 70%, #D8EAF3 88%, #F9F7F4 100%)',
      }}>
        <div className="max-w-md mx-auto">
          <p className="text-white/75 text-xs uppercase tracking-widest mb-1.5">Club de Danse Voiron</p>
          <h1 className="text-white text-3xl font-extrabold">Qui danse ?</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-6 -mt-6 relative">
        {dancers.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>Aucun danseur enregistré.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {dancers.map(dancer => (
              <button
                key={dancer.id}
                onClick={() => handleSelect(dancer)}
                className="group flex flex-col items-center gap-3.5 bg-white border border-gray-100 shadow-sm hover:shadow-md rounded-2xl py-6 px-3 transition-all duration-200 hover:scale-[1.02]"
              >
                <Avatar dancer={dancer} size="lg" />
                <div className="text-center">
                  <p className="text-gray-900 font-bold text-sm truncate max-w-full">{dancer.firstName}</p>
                  <p className="text-gray-500 text-xs truncate max-w-full">{dancer.lastName}</p>
                </div>
                {dancer.roles.includes('trial') && (
                  <span className="text-xs bg-orange/15 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    Essai
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <button onClick={() => signOut(auth)}
          className="mt-auto pt-6 pb-8 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
