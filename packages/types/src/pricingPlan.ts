import type { WithTimestamps } from './common';

export interface PricingPlan extends WithTimestamps {
  id: string;
  seasonId: string;
  label: string;
  amount: number;        // cents
  conditions: string;
  isActive: boolean;
}
