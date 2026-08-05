// Validation des champs saisis, partagée entre l'app mobile et le site web :
// une règle définie à un seul endroit évite qu'une saisie refusée d'un côté
// passe de l'autre.
//
// Constat à l'origine (05/08/2026, clubvoiron-dev) : aucun contrôle n'existait,
// et près de la moitié des valeurs enregistrées étaient inexploitables —
// 14 téléphones sur 30 n'avaient pas 10 chiffres (certains 2 ou 3), et
// 11 codes postaux sur 29 ne faisaient pas 5 chiffres.

/** Retire tout ce qui n'est pas un chiffre (espaces, points, tirets…). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Téléphone : 10 chiffres pour un numéro français (les séparateurs habituels
 * sont tolérés à la saisie), ou format international commençant par « + ».
 * L'international est accepté volontairement : une règle strictement française
 * bloquerait un adhérent étranger, cas déjà présent en base.
 */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('+')) {
    const d = digitsOnly(trimmed);
    return d.length >= 8 && d.length <= 15;
  }
  return digitsOnly(trimmed).length === 10;
}

/** Code postal français : exactement 5 chiffres. */
export function isValidPostalCode(value: string): boolean {
  return digitsOnly(value.trim()).length === 5;
}

export const PHONE_ERROR = 'Le téléphone doit comporter 10 chiffres (ou commencer par + pour un numéro étranger).';
export const POSTAL_CODE_ERROR = 'Le code postal doit comporter 5 chiffres.';

/**
 * Contrôle groupé : renvoie les messages d'erreur des champs renseignés.
 * Les champs vides ne sont pas signalés ici — le caractère obligatoire est
 * géré séparément, selon la configuration du club.
 */
export function validateContactFields(values: {
  phone?: string;
  postalCode?: string;
  emergencyPhone?: string;
}): string[] {
  const errors: string[] = [];
  if (values.phone?.trim() && !isValidPhone(values.phone)) errors.push(PHONE_ERROR);
  if (values.postalCode?.trim() && !isValidPostalCode(values.postalCode)) errors.push(POSTAL_CODE_ERROR);
  if (values.emergencyPhone?.trim() && !isValidPhone(values.emergencyPhone)) {
    errors.push(`Contact d'urgence : ${PHONE_ERROR.charAt(0).toLowerCase()}${PHONE_ERROR.slice(1)}`);
  }
  return errors;
}
