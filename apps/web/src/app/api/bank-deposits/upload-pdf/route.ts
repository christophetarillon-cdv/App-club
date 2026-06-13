import { NextRequest, NextResponse } from 'next/server';
import { getAdminBucket } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    const depositId = formData.get('depositId') as string | null;

    if (!file || !depositId) {
      return NextResponse.json({ error: 'Missing pdf or depositId' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const bucket = getAdminBucket();
    const storageFile = bucket.file(`bank-deposits/${depositId}.pdf`);

    await storageFile.save(buffer, {
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private, max-age=31536000',
      },
    });

    // Generate a signed URL valid for 10 years (permanent for accounting purposes)
    const [url] = await storageFile.getSignedUrl({
      action: 'read',
      expires: '2099-12-31',
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('upload-pdf error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
