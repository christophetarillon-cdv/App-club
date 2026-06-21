import type { WithTimestamps } from './common';

export type AccountRole = 'admin' | 'bureau';

export interface Account extends WithTimestamps {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  isDancerToo: boolean;
  dancerIds: string[];
  roles: AccountRole[];
  isActive: boolean;
  notificationPreferences?: Record<string, boolean>;
  marketingConsent?: boolean;
  imageRightsConsent?: boolean;
  fcmTokens?: string[];
  registeredCourseIds?: string[];
  levelsByStyle?: Record<string, string>;
}
