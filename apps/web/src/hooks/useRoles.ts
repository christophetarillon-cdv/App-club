import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RoleConfig } from '@cdv/types';

export function useRoles() {
  const [roles, setRoles] = useState<RoleConfig[]>([]);

  useEffect(() => {
    getDocs(query(collection(db, 'roles'), orderBy('displayOrder')))
      .then(snap => setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() } as RoleConfig))))
      .catch(() => {});
  }, []);

  const getLabel = (key: string): string =>
    roles.find(r => r.key === key)?.label ?? key;

  return { roles, getLabel };
}
