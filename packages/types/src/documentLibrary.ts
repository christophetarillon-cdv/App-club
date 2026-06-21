import type { FirestoreTimestamp } from './common';

export type DocCategory = 'administrative' | 'practical' | 'pedagogical' | 'events' | 'other';
export type DocAccessLevel = 'public' | 'members' | 'paid-members' | 'specific-roles';

export interface DocumentLibrary {
  id: string;
  title: string;
  description?: string;
  category: DocCategory;
  currentVersionId?: string;
  seasonId?: string;
  accessLevel: DocAccessLevel;
  allowedRoles?: string[];
  tags?: string[];
  downloadCount: number;
  isActive: boolean;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  createdBy: string;
  currentFileName?: string;
  currentFileUrl?: string;
  currentVersionNumber?: string;
  currentMimeType?: string;
  currentSizeBytes?: number;
}

export interface DocumentVersion {
  id: string;
  versionNumber: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  changeNote?: string;
  uploadedBy: string;
  uploadedAt: FirestoreTimestamp;
  isCurrent: boolean;
}
