'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Dancer } from '@cdv/types';

const STORAGE_KEY = 'cdv_selected_dancer_id';

interface DancerContextValue {
  selectedDancer: Dancer | null;
  selectDancer: (dancer: Dancer) => void;
  clearSelectedDancer: () => void;
}

const DancerContext = createContext<DancerContextValue>({
  selectedDancer: null,
  selectDancer: () => {},
  clearSelectedDancer: () => {},
});

export function DancerProvider({ children }: { children: React.ReactNode }) {
  const { dancers, user } = useAuth();
  const [selectedDancer, setSelectedDancer] = useState<Dancer | null>(null);

  // Restaure la sélection depuis localStorage quand les danseurs sont chargés
  useEffect(() => {
    if (!user) {
      setSelectedDancer(null);
      return;
    }
    if (dancers.length === 0) return;

    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      const found = dancers.find(d => d.id === storedId);
      if (found) { setSelectedDancer(found); return; }
    }
    // Si un seul danseur, auto-sélection
    if (dancers.length === 1) {
      setSelectedDancer(dancers[0]!);
      localStorage.setItem(STORAGE_KEY, dancers[0]!.id);
    }
  }, [user, dancers]);

  // Sync si les données du danseur changent (photo, nom, etc.)
  useEffect(() => {
    if (!selectedDancer) return;
    const updated = dancers.find(d => d.id === selectedDancer.id);
    if (updated) setSelectedDancer(updated);
  }, [dancers]);

  const selectDancer = (dancer: Dancer) => {
    setSelectedDancer(dancer);
    localStorage.setItem(STORAGE_KEY, dancer.id);
  };

  const clearSelectedDancer = () => {
    setSelectedDancer(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <DancerContext.Provider value={{ selectedDancer, selectDancer, clearSelectedDancer }}>
      {children}
    </DancerContext.Provider>
  );
}

export const useDancer = () => useContext(DancerContext);
