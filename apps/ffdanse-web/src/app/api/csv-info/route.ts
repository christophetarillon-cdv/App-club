import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Retourne l'URL du CSV à télécharger
    const url = '/data/structures.csv';

    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load CSV info' },
      { status: 500 }
    );
  }
}
