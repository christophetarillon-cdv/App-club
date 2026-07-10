'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import type { DocumentLibrary, DocCategory } from '@cdv/types';
import { AppShell } from '@/components/AppShell';

const CATEGORY_LABELS: Record<DocCategory, string> = {
  administrative: 'Administratif',
  practical: 'Pratique',
  pedagogical: 'Pédagogique',
  events: 'Événements',
  other: 'Autre',
};

const CATEGORY_COLORS: Record<DocCategory, string> = {
  administrative: 'bg-blue-100 text-blue-700',
  practical: 'bg-green-100 text-green-700',
  pedagogical: 'bg-purple-100 text-purple-700',
  events: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
};

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileIcon(mime?: string) {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('word') || mime.includes('document')) return '📘';
  if (mime.includes('sheet') || mime.includes('excel')) return '📗';
  if (mime.includes('image')) return '🖼️';
  return '📄';
}

export default function LibraryPage() {
  const { user, dancers, account } = useAuth();
  const { selectedDancer } = useDancer();

  const [allDocs, setAllDocs] = useState<DocumentLibrary[]>([]);
  const [paidSeasonIds, setPaidSeasonIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | 'all'>('all');

  const isAdmin = !!(account?.roles?.includes('admin') || dancers.some(d => d.roles.includes('admin')));
  const isMember = dancers.some(d => d.roles.some(r => ['member', 'trial', 'instructor', 'bureau', 'admin'].includes(r)));
  const dancerRoles: string[] = dancers.flatMap(d => d.roles);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDocs(query(collection(db, 'documentLibrary'), where('isActive', '==', true), orderBy('category', 'asc'))),
      getDocs(query(collection(db, 'memberships'), where('userId', '==', user.uid))),
    ]).then(([docsSnap, membershipSnap]) => {
      setAllDocs(docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentLibrary)));
      const paid = membershipSnap.docs
        .filter(d => d.data().paymentPlanStatus === 'approved' || d.data().status === 'active')
        .map(d => d.data().seasonId as string).filter(Boolean);
      setPaidSeasonIds([...new Set(paid)]);
      setLoading(false);
    });
  }, [user]);

  const documents = useMemo(() => allDocs.filter(doc => {
    if (isAdmin) return true;
    if (doc.accessLevel === 'public') return true;
    if (!user) return false;
    if (doc.accessLevel === 'members' && isMember) return true;
    if (doc.accessLevel === 'paid-members') {
      const hasAccess = doc.seasonId ? paidSeasonIds.includes(doc.seasonId) : paidSeasonIds.length > 0;
      return hasAccess;
    }
    if (doc.accessLevel === 'specific-roles' && doc.allowedRoles?.some(r => dancerRoles.includes(r))) return true;
    return false;
  }), [allDocs, isAdmin, isMember, dancerRoles, paidSeasonIds, user]);

  const handleDownload = async (doc: DocumentLibrary) => {
    if (!doc.currentFileUrl) return;
    window.open(doc.currentFileUrl, '_blank');
    updateDoc(doc_ref(doc.id), { downloadCount: increment(1) }).catch(() => {});
  };

  const doc_ref = (id: string) => doc(db, 'documentLibrary', id);

  const categories = ['all', ...Array.from(new Set(documents.map(d => d.category)))] as (DocCategory | 'all')[];

  const filtered = documents.filter(d => {
    const matchCat = activeCategory === 'all' || d.category === activeCategory;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase()) ||
      d.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <AppShell>
      <div className="relative overflow-hidden pb-8" style={{
        background: 'linear-gradient(180deg, #2F86C0 0%, #2F86C0 45%, #7FBFE3 70%, #D8EAF3 88%, #F9F7F4 100%)',
      }}>
        <div className="max-w-2xl mx-auto px-4 pt-6">
          <h1 className="text-2xl font-extrabold text-white">Bibliothèque</h1>
        </div>
        <svg className="absolute bottom-0 left-0 w-full h-8 text-background" viewBox="0 0 400 44" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 22 Q100 2 200 18 Q300 32 400 12 L400 44 L0 44 Z" />
        </svg>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-8 -mt-4 relative">

        {/* Recherche */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un document…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm" />
        </div>

        {/* Filtres catégories */}
        {categories.length > 2 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${activeCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {cat === 'all' ? 'Tous' : CATEGORY_LABELS[cat as DocCategory]}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">{search ? 'Aucun document correspondant.' : 'Aucun document disponible.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0 mt-0.5">{fileIcon(d.currentMimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-snug">{d.title}</p>
                        {d.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d.description}</p>
                        )}
                      </div>
                      <button onClick={() => handleDownload(d)} disabled={!d.currentFileUrl}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Télécharger
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[d.category]}`}>
                        {CATEGORY_LABELS[d.category]}
                      </span>
                      {d.currentVersionNumber && (
                        <span className="text-xs text-gray-400">{d.currentVersionNumber}</span>
                      )}
                      {d.currentSizeBytes && (
                        <span className="text-xs text-gray-400">{formatSize(d.currentSizeBytes)}</span>
                      )}
                      {d.tags?.map(tag => (
                        <span key={tag} className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
