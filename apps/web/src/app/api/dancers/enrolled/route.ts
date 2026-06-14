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
    .select('dancerId')
    .get();

  const enrolledDancerIds = snap.docs
    .map(d => d.data().dancerId as string | undefined)
    .filter((id): id is string => Boolean(id));

  return NextResponse.json(enrolledDancerIds);
}
