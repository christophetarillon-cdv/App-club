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

    // Use a Firebase Storage download token instead of a signed URL:
    // - no IAM signBlob permission required (avoids 100+ second timeout)
    // - URL never expires, works like a permanent download link
    const token = crypto.randomUUID();
    const filePath = `bank-deposits/${depositId}.pdf`;

    const bucket = getAdminBucket();
    const storageFile = bucket.file(filePath);

    await storageFile.save(buffer, {
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    const encodedPath = encodeURIComponent(filePath);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;

    return NextResponse.json({ url });
  } catch (err) {
    console.error('upload-pdf error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
