import type { WithTimestamps } from './common';

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface ClubProfile extends WithTimestamps {
  id: 'main';
  officialName: string;
  shortName: string;
  legalStatus: string;
  mainPhone: string;
  mainEmail: string;
  websiteUrl: string;
  headquartersAddress: Address;
  logoUrl: string;
  primaryColor: string;
  shortDescription: string;
}
