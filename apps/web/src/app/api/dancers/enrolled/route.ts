import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await getAdminAuth().verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const seasonId = request.nextUrl.searchParams.get('seasonId');
  if (!seasonId) return NextResponse.json([]);

  const db = getAdminFirestore();
  const snap = await db.collection('memberships')
    .where('seasonId', '==', seasonId)
    .where('paymentPlanStatus', '==', 'approved')
    .select('dancerId', 'userId')
    .get();

  const enrolledIds = new Set<string>();

  // Collect userIds that need account lookup (memberships without dancerId)
  const userIdsToLookup: string[] = [];

  for (const d of snap.docs) {
    const dancerId = d.data().dancerId as string | undefined;
    if (dancerId) {
      enrolledIds.add(dancerId);
    } else {
      // Backward compat: membership created before dancerId was added
      const userId = d.data().userId as string | undefined;
      if (userId) userIdsToLookup.push(userId);
    }
  }

  // For each account without dancerId, take the first dancer
  if (userIdsToLookup.length > 0) {
    const accountDocs = await Promise.all(
      userIdsToLookup.map(uid => db.collection('accounts').doc(uid).get())
    );
    for (const acc of accountDocs) {
      if (acc.exists) {
        const dancerIds: string[] = acc.data()?.dancerIds ?? [];
        if (dancerIds[0]) enrolledIds.add(dancerIds[0]);
      }
    }
  }

  return NextResponse.json([...enrolledIds]);
}
