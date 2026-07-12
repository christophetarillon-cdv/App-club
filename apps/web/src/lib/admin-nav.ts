export interface NavItem {
  label: string;
  href: string;
  highlight?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const MEMBER_NAV: NavGroup[] = [
  {
    label: 'Accès rapide',
    items: [
      { label: 'QR code de présence', href: '/dancer/card' },
      { label: 'Planning des cours', href: '/planning' },
      { label: 'Chat', href: '/chat' },
      { label: 'Médiathèque vidéos', href: '/media' },
      { label: 'Médiathèque audio', href: '/audio' },
      { label: 'Trombinoscope', href: '/trombinoscope' },
      { label: 'Kiosque de pointage', href: '/kiosk' },
      { label: 'Vue moniteur (présences)', href: '/instructor' },
      { label: 'Statistiques de présence', href: '/instructor/stats' },
    ],
  },
  {
    label: 'Espace personnel',
    items: [
      { label: 'Ma cotisation', href: '/membership' },
      { label: 'Mes niveaux par style', href: '/dancer/levels' },
      { label: 'Messages', href: '/dancer/notifications' },
      { label: 'Paramètres notifications', href: '/dancer/settings' },
      { label: 'Mes documents', href: '/my-documents' },
      { label: 'Bibliothèque du club', href: '/library' },
    ],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Structure',
    items: [
      { label: 'Club', href: '/admin/club-settings' },
      { label: 'Saisons', href: '/admin/seasons' },
      { label: 'Styles de danse', href: '/admin/dance-styles' },
      { label: 'Niveaux', href: '/admin/levels' },
      { label: 'Salles', href: '/admin/rooms' },
    ],
  },
  {
    label: 'Programmation',
    items: [
      { label: 'Cours', href: '/admin/courses' },
      { label: 'Interruptions', href: '/admin/interruptions' },
      { label: 'Jours fériés', href: '/admin/public-holidays' },
      { label: 'Planning', href: '/admin/settings/planning' },
      { label: 'Fiche séance', href: '/admin/settings/session-detail' },
      { label: 'Sync agenda', href: '/admin/settings/calendar-sync' },
    ],
  },
  {
    label: 'Membres',
    items: [
      { label: 'Danseurs', href: '/admin/dancers' },
      { label: 'Créer un compte', href: '/admin/dancers/new' },
      { label: 'Import Excel', href: '/admin/dancers/import' },
      { label: 'Danseurs essai', href: '/admin/trial' },
      { label: 'Config essai', href: '/admin/settings/trial' },
      { label: 'Rôles', href: '/admin/settings/roles' },
      { label: 'Champs profil', href: '/admin/settings/profile-fields' },
      { label: 'Champs custom', href: '/admin/settings/custom-fields' },
      { label: 'Mapping profils', href: '/admin/settings/profile-mapping' },
      { label: 'QR accueil', href: '/admin/settings/welcome-qr' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Accès pages', href: '/admin/settings/page-permissions' },
      { label: 'Intégration Google', href: '/admin/settings/google-integration' },
      { label: 'Envoi d\'emails', href: '/admin/emails' },
      { label: 'Kiosque', href: '/admin/settings/kiosk' },
    ],
  },
  {
    label: 'Finances',
    items: [
      { label: 'Tableau de bord', href: '/admin/finances/dashboard', highlight: true },
      { label: 'Plans paiement', href: '/admin/payment-plans' },
      { label: 'Saisir paiement', href: '/admin/payments/new' },
      { label: 'Encaissements', href: '/admin/payments/today', highlight: true },
      { label: 'Bordereaux', href: '/admin/payments/bank-deposits' },
      { label: 'Tarifs', href: '/admin/pricing-plans' },
      { label: 'Comptes bancaires', href: '/admin/settings/bank-accounts' },
      { label: 'Infos de paiement', href: '/admin/settings/payment-info' },
      { label: 'Chèques', href: '/admin/payments/cheques' },
    ],
  },
  {
    label: 'Contenus',
    items: [
      { label: 'Médiathèque', href: '/admin/media' },
      { label: 'Bibliothèque docs', href: '/admin/documents-library' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Actualités', href: '/admin/announcements' },
      { label: 'Canaux de chat', href: '/admin/chat-channels' },
      { label: 'Canaux notif.', href: '/admin/notification-channels' },
      { label: 'Envoyer notif.', href: '/admin/notifications/send' },
      { label: 'Messages privés', href: '/admin/private-messages' },
    ],
  },
  {
    label: 'Exports',
    items: [
      { label: 'Export de données', href: '/admin/exports' },
    ],
  },
];
