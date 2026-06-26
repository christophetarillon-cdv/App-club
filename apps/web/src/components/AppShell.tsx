'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDancer } from '@/contexts/DancerContext';
import { logout } from '@/lib/auth';
import type { Dancer } from '@cdv/types';

// ── Avatar ───────────────────────────────────────────────────────────────────────
function Avatar({ dancer, size = 'md' }: { dancer: Dancer; size?: 'sm' | 'md' }) {
  const initials = `${dancer.firstName[0] ?? ''}${dancer.lastName[0] ?? ''}`.toUpperCase();
  const palette = ['bg-blue-500','bg-purple-500','bg-pink-500','bg-green-500','bg-orange-500','bg-teal-500','bg-red-500','bg-indigo-500'];
  const color = palette[(dancer.firstName.charCodeAt(0) + dancer.lastName.charCodeAt(0)) % palette.length];
  const sz = size === 'md' ? 'w-10 h-10 text-sm rounded-xl' : 'w-8 h-8 text-xs rounded-lg';
  if (dancer.photoUrl) return <img src={dancer.photoUrl} alt={dancer.firstName} className={`${sz} object-cover`} />;
  return <div className={`${sz} ${color} flex items-center justify-center font-bold text-white shrink-0`}>{initials}</div>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────────
type SvgProps = { className?: string };
const HomeIcon     = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>;
const CalendarIcon = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" /></svg>;
const ChatIcon     = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>;
const VideoIcon    = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>;
const UsersIcon    = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
const QrIcon       = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>;
const UserIcon     = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>;
const SettingsIcon = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const LogoutIcon   = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>;
const BellIcon     = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>;
const MusicIcon    = ({ className = 'w-5 h-5' }: SvgProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>;

// ── AppShell ──────────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const { account, dancers } = useAuth();
  const { selectedDancer, selectDancer } = useDancer();
  const pathname = usePathname();
  const router = useRouter();

  const id = selectedDancer?.id ?? '';
  const userRoles = [...(account?.roles ?? []), ...(selectedDancer?.roles ?? [])];
  const isAdmin = userRoles.includes('admin');
  const otherDancers = dancers.filter(d => d.id !== id);

  const handleSwitch = (d: Dancer) => { selectDancer(d); router.push(`/dancer/${d.id}`); };

  const exact = (path: string) => pathname === path;
  const starts = (path: string) => pathname.startsWith(path);

  const sidebarNav = [
    { href: `/dancer/${id}`, label: 'Accueil',  icon: <HomeIcon />,     active: exact(`/dancer/${id}`) },
    { href: '/planning',     label: 'Planning', icon: <CalendarIcon />, active: starts('/planning') },
    { href: '/chat',         label: 'Chat',     icon: <ChatIcon />,     active: starts('/chat') },
    { href: '/media',        label: 'Vidéos',   icon: <VideoIcon />,    active: exact('/media') },
    { href: '/audio',        label: 'Audio',    icon: <MusicIcon />,    active: exact('/audio') },
    { href: '/trombinoscope',label: 'Trombi',   icon: <UsersIcon />,    active: exact('/trombinoscope') },
  ];

  const tabs = [
    { href: `/dancer/${id}`,         label: 'Accueil',  icon: <HomeIcon />,     active: exact(`/dancer/${id}`) },
    { href: '/planning',             label: 'Planning', icon: <CalendarIcon />, active: starts('/planning') },
    { href: '/chat',                 label: 'Chat',     icon: <ChatIcon />,     active: starts('/chat') },
    { href: `/dancer/${id}/card`,    label: 'Ma carte', icon: <QrIcon />,       active: starts(`/dancer/${id}/card`) },
    { href: `/dancer/${id}/profile`, label: 'Profil',   icon: <UserIcon />,     active: starts(`/dancer/${id}/profile`) },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-primary tracking-tight">CDV</span>
          {selectedDancer && <>
            <span className="w-px h-4 bg-gray-200 hidden sm:block" />
            <span className="text-sm text-gray-500 hidden sm:block">{selectedDancer.firstName} {selectedDancer.lastName}</span>
          </>}
        </div>
        <div className="flex items-center gap-2">
          {otherDancers.length > 0 && (
            <div className="flex items-center -space-x-1 mr-1">
              {otherDancers.map(d => (
                <button key={d.id} onClick={() => handleSwitch(d)} title={`Passer à ${d.firstName}`}
                  className="hover:scale-110 transition-transform ring-2 ring-white rounded-lg">
                  <Avatar dancer={d} size="sm" />
                </button>
              ))}
            </div>
          )}
          <Link href="/settings/notifications"
            className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-gray-100 transition-colors">
            <BellIcon />
          </Link>
          {selectedDancer && <Avatar dancer={selectedDancer} size="sm" />}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar (md+) */}
        <aside className="hidden md:flex flex-col w-[72px] bg-white border-r border-gray-200 py-3 shrink-0">
          {sidebarNav.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-1.5 py-3 mx-1.5 rounded-xl transition-colors ${
                item.active ? 'bg-primary/5 text-primary' : 'text-gray-400 hover:bg-background hover:text-primary'
              }`}>
              {item.icon}
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </Link>
          ))}
          <div className="flex-1" />
          {isAdmin && (
            <Link href="/admin/club-settings"
              className={`flex flex-col items-center gap-1.5 py-3 mx-1.5 rounded-xl transition-colors ${
                starts('/admin') ? 'bg-primary/5 text-primary' : 'text-gray-400 hover:bg-background hover:text-primary'
              }`}>
              <SettingsIcon />
              <span className="text-[9px] font-medium leading-none">Admin</span>
            </Link>
          )}
          <button onClick={async () => { await logout(); router.replace('/login'); }}
            className="flex flex-col items-center gap-1.5 py-3 mx-1.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogoutIcon />
            <span className="text-[9px] font-medium leading-none">Quitter</span>
          </button>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-10">
        {tabs.map(tab => (
          <Link key={tab.href} href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              tab.active ? 'text-primary' : 'text-gray-400 hover:text-primary'
            }`}>
            {tab.icon}
            <span className="text-[9px] font-medium leading-none">{tab.label}</span>
          </Link>
        ))}
      </nav>

    </div>
  );
}
