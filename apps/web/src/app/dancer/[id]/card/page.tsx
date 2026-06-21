'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useRoles } from '@/hooks/useRoles';

export default function DancerCardPage() {
  const { getLabel } = useRoles();
  const { id } = useParams<{ id: string }>();
  const { dancers, account, loading } = useAuth();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrReady, setQrReady] = useState(false);

  const dancer = dancers.find(d => d.id === id);

  useEffect(() => {
    if (!loading && !dancer) router.replace('/select-dancer');
  }, [loading, dancer, router]);

  useEffect(() => {
    if (!dancer || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, dancer.id, {
      width: 220,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    }).then(() => setQrReady(true)).catch(() => {});
  }, [dancer?.id]);

  if (loading || !dancer) return null;

  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();
  const colors = ['bg-blue-500','bg-purple-500','bg-pink-500','bg-green-500','bg-orange-500'];
  const color = colors[(dancer.firstName.charCodeAt(0) + dancer.lastName.charCodeAt(0)) % colors.length];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/dancer/${id}/profile`} className="text-sm text-gray-400 hover:text-gray-700">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900">Ma carte & QR code</h1>
        </div>

        {/* Carte de membre */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 mb-5 shadow-xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest">Club de Danse Voiron</p>
              <p className="text-white/70 text-sm mt-0.5">Carte de membre</p>
            </div>
            <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
              <span className="text-white font-bold text-sm">{initials}</span>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white text-xl font-bold">{dancer.firstName} {dancer.lastName}</p>
              {dancer.memberNumber && (
                <p className="text-white/40 font-mono text-xs mt-1">{dancer.memberNumber}</p>
              )}
              <div className="flex gap-2 mt-2">
                {dancer.roles.map(r => (
                  <span key={r} className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full capitalize">
                    {getLabel(r)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* QR code */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
          <p className="text-sm font-medium text-gray-700 mb-4">QR code de pointage</p>
          <div className="flex justify-center">
            <canvas ref={canvasRef} className={`rounded-xl ${qrReady ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Présente ce QR code au kiosque pour pointer ta présence.
          </p>
        </div>
      </div>
    </div>
  );
}
