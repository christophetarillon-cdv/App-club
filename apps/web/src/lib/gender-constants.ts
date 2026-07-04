// Format canonique du genre dans toute l'app (web + mobile) : codes anglais
// 'male'/'female', jamais le libellé français directement. Le mobile
// (GenderPicker) compare les valeurs par égalité stricte pour savoir quelle
// puce est sélectionnée — stocker "Femme"/"Homme" en toutes lettres casse
// cet affichage silencieusement.
export type Gender = 'male' | 'female';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
];

const GENDER_LABELS: Record<string, string> = { male: 'Homme', female: 'Femme' };

export function genderLabel(value: string | undefined | null): string {
  if (!value) return '';
  return GENDER_LABELS[value] ?? value;
}
