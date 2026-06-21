export interface NavItem {
  label: string;
  href: string;
  highlight?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

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
    ],
  },
  {
    label: 'Membres',
    items: [
      { label: 'Danseurs', href: '/admin/dancers' },
      { label: 'Danseurs essai', href: '/admin/trial' },
      { label: 'Config essai', href: '/admin/settings/trial' },
      { label: 'Champs profil', href: '/admin/settings/profile-fields' },
      { label: 'Champs custom', href: '/admin/settings/custom-fields' },
      { label: 'QR accueil', href: '/admin/settings/welcome-qr' },
    ],
  },
  {
    label: 'Finances',
    items: [
      { label: 'Tarifs', href: '/admin/pricing-plans' },
      { label: 'Plans paiement', href: '/admin/payment-plans' },
      { label: 'Encaissements', href: '/admin/payments/today', highlight: true },
      { label: 'Saisir paiement', href: '/admin/payments/new' },
      { label: 'Chèques', href: '/admin/payments/cheques' },
      { label: 'Bordereaux', href: '/admin/payments/bank-deposits' },
      { label: 'Comptes bancaires', href: '/admin/settings/bank-accounts' },
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
      { label: 'Canaux de chat', href: '/admin/chat-channels' },
      { label: 'Canaux notif.', href: '/admin/notification-channels' },
      { label: 'Envoyer notif.', href: '/admin/notifications/send' },
      { label: 'Messages privés', href: '/admin/private-messages' },
    ],
  },
];
