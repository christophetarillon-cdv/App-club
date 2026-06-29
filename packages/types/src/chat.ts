import type { FirestoreTimestamp } from './common';

export type ChatPublisherType = 'admins_only' | 'specific_dancers' | 'all_members';

export interface ChatChannel {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  publisherType: ChatPublisherType;
  publisherIds?: string[]; // dancerIds when publisherType === 'specific_dancers'
  newMembersAccess?: boolean; // false = admins/instructeurs seulement ; true (défaut) = tous les membres actuels
  createdAt: FirestoreTimestamp;
  createdBy: string; // accountId
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;      // dancerId
  authorName: string;
  authorPhotoUrl?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video';
  mediaId?: string;      // ref to media doc for encoding status
  fileName?: string;
  sentAt: FirestoreTimestamp;
}

export interface PrivateMessage {
  id: string;
  fromDancerId: string;
  fromDancerName: string;
  fromAccountId: string;
  text: string;
  sentAt: FirestoreTimestamp;
  readAt?: FirestoreTimestamp;
}
