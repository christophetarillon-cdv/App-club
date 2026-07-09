import type { WithTimestamps } from './common';

export type ProfileFieldKey =
  | 'firstName' | 'lastName' | 'email'
  | 'birthDate' | 'gender' | 'phone'
  | 'street' | 'postalCode' | 'city' | 'emergencyContact' | 'photo'
  | 'profession' | 'medicalNotes' | 'healthCertificate'
  | 'marketingConsent' | 'imageRightsConsent';

export interface ProfileFieldConfig {
  enabled: boolean;
  required: boolean;
  lockedByDefault?: boolean;
}

export type ProfileFieldsConfig = Record<ProfileFieldKey, ProfileFieldConfig>;

export const DEFAULT_PROFILE_FIELDS: ProfileFieldsConfig = {
  firstName:          { enabled: true,  required: true,  lockedByDefault: true },
  lastName:           { enabled: true,  required: true,  lockedByDefault: true },
  email:              { enabled: true,  required: true,  lockedByDefault: true },
  birthDate:          { enabled: true,  required: false },
  gender:             { enabled: false, required: false },
  phone:              { enabled: true,  required: true },
  street:             { enabled: true,  required: false },
  postalCode:         { enabled: true,  required: false },
  city:               { enabled: true,  required: false },
  emergencyContact:   { enabled: true,  required: false },
  photo:              { enabled: true,  required: false },
  profession:         { enabled: false, required: false },
  medicalNotes:       { enabled: false, required: false },
  healthCertificate:  { enabled: false, required: false },
  marketingConsent:   { enabled: true,  required: false },
  imageRightsConsent: { enabled: true,  required: false },
};

export interface AppSettings extends WithTimestamps {
  trialMaxSessions: number;
  trialMaxDays: number;
  welcomeMessage?: string;
  welcomeSubMessage?: string;
  schoolZone?: 'A' | 'B' | 'C';
  cancelOnPublicHolidays?: boolean;
  cancelOnPublicHolidaysOnlyDuringSchoolHolidays?: boolean;
  profileFields?: ProfileFieldsConfig;
  profileMapping?: Record<string, { schemaId: string }>;
  pagePermissions?: Record<string, string[]>;
  // Fiche détail de séance : rôles autorisés à ajouter une vidéo, à la voir,
  // à voir la note de programme du jour, et à la modifier.
  sessionVideoUploadRoles?: string[];
  sessionVideoViewRoles?: string[];
  sessionNoteViewRoles?: string[];
  sessionNoteEditRoles?: string[];
  // Rôles autorisés à s'abonner au flux iCal de leur planning.
  calendarSyncRoles?: string[];
  // Informations affichées entre le choix du mode de paiement et la saisie
  // de l'échéancier (cotisation) — nombre max de chèques, RIB, etc.
  paymentInfoCheque?: string;
  paymentInfoTransfer?: string;
  paymentInfoCash?: string;
  paymentInfoHelloasso?: string;
}

export const DEFAULT_PAYMENT_INFO = {
  cheque: "Vous pouvez régler par chèque, en un ou plusieurs versements (10 maximum). Pour chaque chèque, indiquez la date d'encaissement souhaitée, le montant, le numéro du chèque, la banque et la ville. Merci de remettre les chèques au club avant les dates d'encaissement indiquées.",
  transfer: "Le règlement par virement se fait en un seul versement. Indiquez la date et le montant du virement, puis effectuez-le vers les coordonnées bancaires du club indiquées ci-dessous.",
  cash: "Le règlement en espèces se fait en un seul versement, à remettre en main propre à un responsable du club. Indiquez le montant et la date de remise.",
  helloasso: "Vous allez être redirigé vers HelloAsso pour régler en ligne par carte bancaire, en un seul versement. Sur son écran de paiement, HelloAsso propose une contribution volontaire à son propre fonctionnement (non reversée au club) — elle est modifiable ou peut être mise à zéro via le bouton \"Modifier\".",
} as const;
