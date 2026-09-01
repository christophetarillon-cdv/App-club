const APP_STORE_URL = 'https://apps.apple.com/fr/app/cdcv/id6790001972';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=fr.clubdansecoublevievoiron.app';

export function AppStoreButtons() {
  return (
    <div className="flex gap-2">
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-800 shrink-0" fill="currentColor">
          <path d="M16.365 1.43c0 1.14-.415 2.07-1.246 2.79-.83.72-1.79 1.11-2.88 1.02-.045-1.05.36-2.04 1.155-2.79.795-.75 1.83-1.14 3.06-.99 0-.01-.045-.02-.09-.03zM20.25 17.09c-.63 1.44-.945 2.07-1.755 3.33-1.14 1.77-2.745 3.99-4.725 4.005-1.77.015-2.235-1.155-4.635-1.14-2.4.015-2.925 1.17-4.71 1.155-1.98-.015-3.495-2.01-4.635-3.78C-1.68 15.985-.63 8.5 3.15 4.6c1.845-1.905 4.02-2.115 5.475-2.115 1.53 0 2.475 1.155 4.605 1.155 2.07 0 2.685-1.155 4.605-1.155 1.29 0 3.435.15 5.13 2.4-4.335 2.475-3.615 8.86 2.55 12.2-.135.24-.735 1.845-1.265 2.005z"/>
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[9px] text-gray-500">Télécharger sur</span>
          <span className="block text-xs font-semibold text-gray-900">App Store</span>
        </span>
      </a>
      <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
          <path d="M3.6 2.65a1.5 1.5 0 00-.6 1.2v16.3a1.5 1.5 0 00.6 1.2l.09.06L13.5 12 3.7 2.59z" fill="#00d4ff"/>
          <path d="M16.9 15.4l-3.4-3.4 3.4-3.4 4.05 2.34c.9.52.9 1.6 0 2.12z" fill="#ffcf00"/>
          <path d="M13.5 12L3.7 2.59a1.13 1.13 0 011.15-.02l11.65 6.72z" fill="#00f076"/>
          <path d="M13.5 12l3.4 3.4-11.65 6.72a1.13 1.13 0 01-1.15-.02z" fill="#ff3a44"/>
        </svg>
        <span className="text-left leading-tight">
          <span className="block text-[9px] text-gray-500">Disponible sur</span>
          <span className="block text-xs font-semibold text-gray-900">Google Play</span>
        </span>
      </a>
    </div>
  );
}
