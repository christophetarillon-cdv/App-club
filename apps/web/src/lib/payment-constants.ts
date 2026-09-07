export type PaymentMethod = 'cheque' | 'transfer' | 'cash' | 'helloasso';

export const METHOD_LABEL: Record<PaymentMethod | 'mixed', string> = {
  cheque: 'Chèque',
  transfer: 'Virement',
  cash: 'Espèces',
  helloasso: 'CB / En ligne',
  mixed: 'Mixte',
};

export const METHOD_LABEL_PLURAL: Record<PaymentMethod, string> = {
  cheque: 'Chèques',
  transfer: 'Virements',
  cash: 'Espèces',
  helloasso: 'CB / En ligne',
};

export const METHOD_COLOR: Record<PaymentMethod, string> = {
  cheque: 'bg-blue-100 text-blue-700',
  transfer: 'bg-purple-100 text-purple-700',
  cash: 'bg-green-100 text-green-700',
  helloasso: 'bg-emerald-100 text-emerald-700',
};

export const ITEM_LABEL: Record<PaymentMethod, string> = {
  cheque: 'chèque',
  transfer: 'virement',
  cash: 'règlement espèces',
  helloasso: 'paiement en ligne',
};

export const METHOD_TABS: { key: PaymentMethod; label: string }[] = [
  { key: 'cheque', label: 'Chèques' },
  { key: 'transfer', label: 'Virements' },
  { key: 'cash', label: 'Espèces' },
  { key: 'helloasso', label: 'CB / En ligne' },
];

export const PDF_TITLE: Record<PaymentMethod, string> = {
  cheque: 'Bordereau de remise de chèques',
  transfer: 'Récapitulatif des virements reçus',
  cash: "Bordereau de remise d'espèces",
  helloasso: 'Récapitulatif des paiements en ligne (HelloAsso)',
};

export const MAX_INSTALLMENTS: Record<PaymentMethod, number> = {
  cheque: 10,
  transfer: 1,
  cash: 1,
  helloasso: 1,
};

// Plafond étendu pour l'admin (saisie manuelle/complétion) et les danseurs
// du rôle "bureau" en auto-inscription — les autres restent à MAX_INSTALLMENTS.
const MAX_INSTALLMENTS_EXTENDED = 11;
const EXTENDABLE_METHODS: PaymentMethod[] = ['cheque', 'transfer'];

export function getMaxInstallments(method: PaymentMethod, extended = false): number {
  if (extended && EXTENDABLE_METHODS.includes(method)) return MAX_INSTALLMENTS_EXTENDED;
  return MAX_INSTALLMENTS[method] ?? 1;
}

export interface Installment {
  expectedDate: string;
  amount: string;
  // Mode de ce versement précis — optionnel : seuls les plans mixtes
  // (admin/bureau) le renseignent, un plan à mode unique le laisse vide et
  // utilise le mode global du plan pour tous ses versements.
  method?: PaymentMethod;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
}

export const emptyInstallment = (): Installment => ({
  expectedDate: '', amount: '', chequeNumber: '', draweeBank: '', draweeCity: '',
});

// Nombre de versements par mode (le mode absent d'une ligne compte comme
// `fallbackMethod`, le mode du plan pour les plans à mode unique).
export function methodCounts(installments: Installment[], fallbackMethod: PaymentMethod): Partial<Record<PaymentMethod, number>> {
  const counts: Partial<Record<PaymentMethod, number>> = {};
  installments.forEach(i => {
    const m = i.method ?? fallbackMethod;
    counts[m] = (counts[m] ?? 0) + 1;
  });
  return counts;
}

const ALL_METHODS: PaymentMethod[] = ['cheque', 'transfer', 'cash', 'helloasso'];

// Un plan mixte (admin/bureau) reste ajoutable tant qu'au moins un mode n'a
// pas atteint son propre plafond — pas le total des versements du plan.
export function canAddInstallment(installments: Installment[], fallbackMethod: PaymentMethod, extended: boolean): boolean {
  const counts = methodCounts(installments, fallbackMethod);
  return ALL_METHODS.some(m => (counts[m] ?? 0) < getMaxInstallments(m, extended));
}

// Reprend banque/ville (et le mode, pour les plans mixtes) du dernier
// versement pour éviter de les ressaisir à chaque chèque — si le mode du
// dernier versement a atteint son plafond, bascule sur le premier mode
// encore disponible.
export function nextInstallment(prev: Installment[], extended = false): Installment {
  const last = prev[prev.length - 1];
  let method = last?.method;
  if (method) {
    const counts = methodCounts(prev, method);
    if ((counts[method] ?? 0) >= getMaxInstallments(method, extended)) {
      method = ALL_METHODS.find(m => (counts[m] ?? 0) < getMaxInstallments(m, extended));
    }
  }
  return {
    ...emptyInstallment(),
    method,
    draweeBank: last?.draweeBank ?? '',
    draweeCity: last?.draweeCity ?? '',
  };
}

export function chequeFields(method: PaymentMethod, inst: Installment) {
  if (method !== 'cheque') return {};
  return {
    ...(inst.chequeNumber ? { chequeNumber: inst.chequeNumber } : {}),
    ...(inst.draweeBank ? { draweeBank: inst.draweeBank } : {}),
    ...(inst.draweeCity ? { draweeCity: inst.draweeCity } : {}),
  };
}
