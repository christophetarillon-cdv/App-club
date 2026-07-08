import type { Account, Dancer, ProfileFieldsConfig } from '@cdv/types';
import { DEFAULT_PROFILE_FIELDS } from '@cdv/types';

export function mergeProfileFieldsConfig(saved: Partial<ProfileFieldsConfig> | undefined): ProfileFieldsConfig {
  const merged = { ...DEFAULT_PROFILE_FIELDS };
  if (saved) {
    for (const key of Object.keys(DEFAULT_PROFILE_FIELDS) as (keyof ProfileFieldsConfig)[]) {
      if (saved[key]) merged[key] = { ...DEFAULT_PROFILE_FIELDS[key], ...saved[key] };
    }
  }
  return merged;
}

export interface MissingField {
  key: string;
  label: string;
}

export function computeMissingAccountFields(account: Account | null, fieldConfig: ProfileFieldsConfig): MissingField[] {
  const missing: MissingField[] = [];
  if (!account) return missing;
  if (fieldConfig.phone.required && !account.phone?.trim()) missing.push({ key: 'phone', label: 'Téléphone' });
  if (fieldConfig.marketingConsent.required && !account.marketingConsent) missing.push({ key: 'marketingConsent', label: 'Consentement marketing' });
  if (fieldConfig.imageRightsConsent.required && !account.imageRightsConsent) missing.push({ key: 'imageRightsConsent', label: "Droit à l'image" });
  return missing;
}

export function computeMissingDancerFields(dancer: Dancer, fieldConfig: ProfileFieldsConfig): MissingField[] {
  const missing: MissingField[] = [];
  if (fieldConfig.birthDate.required && !dancer.birthDate) missing.push({ key: 'birthDate', label: 'Date de naissance' });
  if (fieldConfig.gender.required && !dancer.gender) missing.push({ key: 'gender', label: 'Genre' });
  if (fieldConfig.street.required && !dancer.street?.trim()) missing.push({ key: 'street', label: 'Rue' });
  if (fieldConfig.postalCode.required && !dancer.postalCode?.trim()) missing.push({ key: 'postalCode', label: 'Code postal' });
  if (fieldConfig.city.required && !dancer.city?.trim()) missing.push({ key: 'city', label: 'Ville' });
  if (fieldConfig.profession.required && !dancer.profession?.trim()) missing.push({ key: 'profession', label: 'Profession' });
  if (fieldConfig.emergencyContact.required && !(dancer.emergencyContact?.name?.trim() && dancer.emergencyContact?.phone?.trim())) {
    missing.push({ key: 'emergencyContact', label: "Contact d'urgence" });
  }
  if (fieldConfig.medicalNotes.required && !dancer.medicalNotes?.trim()) missing.push({ key: 'medicalNotes', label: 'Notes médicales' });
  if (fieldConfig.healthCertificate.required && !dancer.healthCertificate) missing.push({ key: 'healthCertificate', label: 'Certificat médical' });
  return missing;
}
