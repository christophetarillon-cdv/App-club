import type { WithTimestamps } from './common';

export type CustomFieldType =
  | 'text' | 'long_text' | 'number' | 'date'
  | 'select' | 'multiselect' | 'checkbox' | 'file';

export type CustomFieldRole = 'member' | 'instructor' | 'bureau' | 'admin';

export interface ProfileSchema extends WithTimestamps {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: string;
}

export interface CustomField extends WithTimestamps {
  id: string;
  label: string;
  key: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
  visibility: CustomFieldRole[];
  editability: CustomFieldRole[];
  displayOrder: number;
  category?: string;
  helpText?: string;
}
