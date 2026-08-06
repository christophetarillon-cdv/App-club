'use client';

import { useState, useEffect } from 'react';
import Search from '@/components/Search';
import Login from '@/components/Login';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ffdanse_token');
    setIsAuthenticated(!!token);
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Chargement...</div>;
  }

  return isAuthenticated ? (
    <Search onLogout={() => {
      localStorage.removeItem('ffdanse_token');
      setIsAuthenticated(false);
    }} />
  ) : (
    <Login onSuccess={() => setIsAuthenticated(true)} />
  );
}
