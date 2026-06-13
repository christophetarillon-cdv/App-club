export interface FirestoreTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

export interface WithTimestamps {
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export type AppEnv = 'dev' | 'beta' | 'prod';
