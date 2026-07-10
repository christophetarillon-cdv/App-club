import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const filename = req.nextUrl.searchParams.get('filename') ?? 'fichier';
  if (!url || !url.startsWith('https://firebasestorage.googleapis.com/')) {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 });
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: 'Téléchargement échoué' }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
