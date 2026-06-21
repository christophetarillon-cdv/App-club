export type RoleColor = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray' | 'pink' | 'teal';

export interface RoleConfig {
  id: string;
  key: string;
  label: string;
  color: RoleColor;
  isSystem: boolean;
  displayOrder: number;
}

export const SYSTEM_ROLES: Omit<RoleConfig, 'id'>[] = [
  { key: 'member',     label: 'Membre',    color: 'blue',   isSystem: true, displayOrder: 0 },
  { key: 'trial',      label: 'Essai',     color: 'orange', isSystem: true, displayOrder: 1 },
  { key: 'instructor', label: 'Moniteur',  color: 'green',  isSystem: true, displayOrder: 2 },
  { key: 'bureau',     label: 'Bureau',    color: 'purple', isSystem: true, displayOrder: 3 },
  { key: 'admin',      label: 'Admin',     color: 'red',    isSystem: true, displayOrder: 4 },
];

export const ROLE_PRIORITY: Record<string, number> = {
  admin: 5, bureau: 4, instructor: 3, member: 2, trial: 1,
};

export const ROLE_COLOR_CLASSES: Record<RoleColor, { bg: string; text: string; border: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  gray:   { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
  pink:   { bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-pink-200' },
  teal:   { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200' },
};
