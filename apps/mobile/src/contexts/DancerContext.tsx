import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import type { Dancer } from '@cdv/types';

const STORAGE_KEY = 'cdcv_selected_dancer_id';

interface DancerContextType {
  selectedDancer: Dancer | null;
  selectDancer: (id: string) => void;
  clearDancer: () => void;
}

const DancerContext = createContext<DancerContextType>({
  selectedDancer: null,
  selectDancer: () => {},
  clearDancer: () => {},
});

export function DancerProvider({ children }: { children: React.ReactNode }) {
  const { user, dancers, loading } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Restore persisted dancer on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(id => {
      if (id) setSelectedId(id);
    });
  }, []);

  // Clear selected dancer when user logs out
  useEffect(() => {
    if (!user) {
      setSelectedId(null);
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Auto-select if only one dancer
  useEffect(() => {
    if (loading || dancers.length === 0) return;
    if (dancers.length === 1 && !selectedId) {
      setSelectedId(dancers[0]!.id);
      AsyncStorage.setItem(STORAGE_KEY, dancers[0]!.id);
    }
  }, [dancers, loading]);

  const selectDancer = (id: string) => {
    setSelectedId(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
  };

  const clearDancer = () => {
    setSelectedId(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  };

  const selectedDancer = dancers.find(d => d.id === selectedId) ?? null;

  return (
    <DancerContext.Provider value={{ selectedDancer, selectDancer, clearDancer }}>
      {children}
    </DancerContext.Provider>
  );
}

export const useDancer = () => useContext(DancerContext);
