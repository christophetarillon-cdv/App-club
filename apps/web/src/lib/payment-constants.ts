export type PaymentMethod = 'cheque' | 'transfer' | 'cash';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cheque: 'Chèque',
  transfer: 'Virement',
  cash: 'Espèces',
};

export const METHOD_LABEL_PLURAL: Record<PaymentMethod, string> = {
  cheque: 'Chèques',
  transfer: 'Virements',
  cash: 'Espèces',
};

export const METHOD_COLOR: Record<PaymentMethod, string> = {
  cheque: 'bg-blue-100 text-blue-700',
  transfer: 'bg-purple-100 text-purple-700',
  cash: 'bg-green-100 text-green-700',
};

export const ITEM_LABEL: Record<PaymentMethod, string> = {
  cheque: 'chèque',
  transfer: 'virement',
  cash: 'règlement espèces',
};

export const METHOD_TABS: { key: PaymentMethod; label: string }[] = [
  { key: 'cheque', label: 'Chèques' },
  { key: 'transfer', label: 'Virements' },
  { key: 'cash', label: 'Espèces' },
];

export const PDF_TITLE: Record<PaymentMethod, string> = {
  cheque: 'Bordereau de remise de chèques',
  transfer: 'Récapitulatif des virements reçus',
  cash: "Bordereau de remise d'espèces",
};

export const MAX_INSTALLMENTS: Record<PaymentMethod, number> = {
  cheque: 10,
  transfer: 1,
  cash: 1,
};

export interface Installment {
  expectedDate: string;
  amount: string;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
}

export const emptyInstallment = (): Installment => ({
  expectedDate: '', amount: '', chequeNumber: '', draweeBank: '', draweeCity: '',
});

export function chequeFields(method: PaymentMethod, inst: Installment) {
  if (method !== 'cheque') return {};
  return {
    ...(inst.chequeNumber ? { chequeNumber: inst.chequeNumber } : {}),
    ...(inst.draweeBank ? { draweeBank: inst.draweeBank } : {}),
    ...(inst.draweeCity ? { draweeCity: inst.draweeCity } : {}),
  };
}
