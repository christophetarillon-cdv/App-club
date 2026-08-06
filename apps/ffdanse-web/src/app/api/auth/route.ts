import { NextRequest, NextResponse } from 'next/server';

const CORRECT_PASSWORD = process.env.FFDANSE_PASSWORD || 'ffdanse2026';
const SECRET_KEY = process.env.FFDANSE_SECRET || 'secret-key-12345';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password === CORRECT_PASSWORD) {
    // Génère un token simple (dans un vrai projet, utiliser JWT)
    const token = Buffer.from(`${password}:${Date.now()}`).toString('base64');

    return NextResponse.json(
      { token },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { error: 'Invalid password' },
    { status: 401 }
  );
}
