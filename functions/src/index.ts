import { onDocumentCreated, onDocumentWritten, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

const getDb = () => admin.firestore();
const getAuth = () => admin.auth();

// ── onDancerCreated — normalise noms + assigne memberNumber ───────────────────
export const onDancerCreated = onDocumentCreated(
  { document: 'dancers/{dancerId}', region: 'europe-west3' },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const db = getDb();

    // 1. Normalise firstNameLower / lastNameLower
    const updates: Record<string, unknown> = {};
    if (!data.firstNameLower && data.firstName) {
      updates.firstNameLower = (data.firstName as string).toLowerCase();
    }
    if (!data.lastNameLower && data.lastName) {
      updates.lastNameLower = (data.lastName as string).toLowerCase();
    }
    if (Object.keys(updates).length > 0) {
      await event.data!.ref.update(updates);
    }

    // 2. Assigne memberNumber (format YYYY-NNN, reset chaque année)
    const counterRef = db.doc('config/memberCounter');
    const year = new Date().getFullYear();

    const memberNumber = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const stored = snap.exists ? (snap.data() ?? {}) : {};
      const storedYear: number = (stored.year as number) ?? 0;
      const last: number = storedYear === year ? ((stored.lastNumber as number) ?? 0) : 0;
      const next = last + 1;
      tx.set(counterRef, { lastNumber: next, year }, { merge: false });
      return `${year}-${String(next).padStart(3, '0')}`;
    });

    await event.data!.ref.update({ memberNumber });
  },
);

// ── notifyTrialLimitReached — notifie quand trialSessionsUsed atteint la limite
export const notifyTrialLimitReached = onDocumentUpdated(
  { document: 'dancers/{dancerId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (!(after.roles as string[])?.includes('trial')) return;

    const db = getDb();
    const settingsSnap = await db.doc('appSettings/main').get();
    const maxTrialSessions: number = (settingsSnap.data()?.trialMaxSessions as number) ?? 3;

    const sessionsBefore: number = (before.trialSessionsUsed as number) ?? 0;
    const sessionsAfter: number = (after.trialSessionsUsed as number) ?? 0;

    if (sessionsAfter < maxTrialSessions || sessionsBefore >= maxTrialSessions) return;

    const uid = after.accountId as string;
    const accountSnap = await db.doc(`accounts/${uid}`).get();
    const email: string | undefined = accountSnap.data()?.email as string | undefined;
    const firstName: string = (after.firstName as string) ?? '';

    if (email) {
      const configSnap = await db.doc('config/email').get();
      const cfg = configSnap.data() as any;
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: cfg.smtpHost ?? 'smtp.gmail.com',
        port: cfg.smtpPort ?? 587,
        secure: false,
        auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      });
      await transporter.sendMail({
        from: `"${cfg.fromName ?? 'CDV'}" <${cfg.smtpUser}>`,
        to: email,
        subject: 'Vos cours d\'essai sont terminés — Rejoignez le club !',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2>Bonjour ${firstName},</h2>
          <p>Vous avez utilisé vos <strong>${maxTrialSessions} séances d'essai</strong> au club CDV.</p>
          <p>Pour continuer à pratiquer, inscrivez-vous comme membre en vous connectant à l'application.</p>
          <p style="color:#999;font-size:12px;">À très bientôt au club !</p>
        </div>`,
      });
    }

    const fcmToken: string | undefined = accountSnap.data()?.fcmToken as string | undefined;
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Cours d\'essai terminés',
          body: 'Rejoignez le club pour continuer à danser !',
        },
      });
    }
  },
);

// ── sendPasswordReset ─────────────────────────────────────────────────────────
export const sendPasswordReset = onRequest({ region: 'europe-west3' }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const { email } = req.body ?? {};
  if (!email) { res.status(400).json({ error: 'email_required' }); return; }

  try {
    const db = getDb();
    const configSnap = await db.doc('config/email').get();
    if (!configSnap.exists) { res.status(500).json({ error: 'email_not_configured' }); return; }
    const cfg = configSnap.data() as any;

    const nodemailer = await import('nodemailer');
    const resetLink = await getAuth().generatePasswordResetLink(email);
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost ?? 'smtp.gmail.com',
      port: cfg.smtpPort ?? 587,
      secure: false,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
    await transporter.sendMail({
      from: `"${cfg.fromName ?? 'CDV'}" <${cfg.smtpUser}>`,
      to: email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
        <h2>Mot de passe oublié ?</h2>
        <p>Cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe. Ce lien est valable <strong>1 heure</strong>.</p>
        <a href="${resetLink}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#1B3A6B;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          Réinitialiser mon mot de passe
        </a>
        <p style="color:#999;font-size:12px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      </div>`,
    });
    res.json({ success: true });
  } catch (e: any) {
    const code = e?.code;
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      res.status(404).json({ error: 'user_not_found' });
    } else {
      res.status(500).json({ error: 'send_failed', detail: e?.message });
    }
  }
});

// ── generateSessions — génère les séances d'un cours sur la saison ────────────
export const generateSessions = onDocumentWritten(
  { document: 'courses/{courseId}', region: 'europe-west3' },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after) return; // suppression — on ne touche pas aux séances

    const courseId = event.params.courseId;
    const db = getDb();

    // Charge la saison
    const seasonSnap = await db.doc(`seasons/${after.seasonId}`).get();
    if (!seasonSnap.exists) return;
    const season = seasonSnap.data()!;
    const seasonStart: admin.firestore.Timestamp = season.startDate;
    const seasonEnd: admin.firestore.Timestamp = season.endDate;

    // Charge les interruptions
    const interruptionsSnap = await db.collection('interruptions').get();
    const interruptions = interruptionsSnap.docs.map(d => d.data());

    // Charge les jours fériés
    const holidaysSnap = await db.collection('publicHolidays').get();
    const publicHolidayDates = new Set(holidaysSnap.docs.map(d => d.data().date as string));

    // Charge appSettings
    const settingsSnap = await db.doc('appSettings/main').get();
    const settings = settingsSnap.data() ?? {};
    const schoolZone: string = settings.schoolZone ?? 'A';
    const cancelOnPublicHolidays: boolean = settings.cancelOnPublicHolidays ?? true;
    const cancelOnlyDuringSchoolHolidays: boolean = settings.cancelOnPublicHolidaysOnlyDuringSchoolHolidays ?? false;

    // Charge les séances existantes du cours (pour éviter les doublons)
    const existingSnap = await db.collection('sessions').where('courseId', '==', courseId).get();
    const existingDates = new Set(existingSnap.docs.map(d => d.data().date as string));

    const dayOfWeek: number = after.dayOfWeek;
    const startTime: string = after.startTime;
    const endTime: string = after.endTime;

    const start = seasonStart.toDate();
    const end = seasonEnd.toDate();

    const isInInterruption = (dateStr: string): boolean => {
      for (const intr of interruptions) {
        if (intr.type === 'school_holiday' && intr.zone !== schoolZone) continue;
        if (dateStr >= intr.startDate && dateStr <= intr.endDate) return true;
      }
      return false;
    };

    const isSchoolHoliday = (dateStr: string): boolean => {
      for (const intr of interruptions) {
        if (intr.type !== 'school_holiday') continue;
        if (intr.zone !== schoolZone) continue;
        if (dateStr >= intr.startDate && dateStr <= intr.endDate) return true;
      }
      return false;
    };

    console.log(`[generateSessions] courseId=${courseId} dayOfWeek=${dayOfWeek} season=${start.toISOString().slice(0,10)}→${end.toISOString().slice(0,10)} existingDates=${existingDates.size} holidays=${publicHolidayDates.size} interruptions=${interruptions.length} cancelOnHolidays=${cancelOnPublicHolidays} onlyDuringSchoolHolidays=${cancelOnlyDuringSchoolHolidays} zone=${schoolZone}`);

    const batch = db.batch();
    let count = 0;
    const skippedLog: string[] = [];

    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      if (cursor.getDay() === dayOfWeek) {
        const dateStr = cursor.toISOString().slice(0, 10);

        if (!existingDates.has(dateStr)) {
          let skip = false;
          let skipReason = '';

          if (isInInterruption(dateStr)) {
            skip = true; skipReason = 'interruption';
          } else if (cancelOnPublicHolidays && publicHolidayDates.has(dateStr)) {
            if (cancelOnlyDuringSchoolHolidays) {
              skip = isSchoolHoliday(dateStr);
              skipReason = skip ? 'holiday+schoolholiday' : '';
            } else {
              skip = true; skipReason = 'holiday';
            }
          }

          if (skip) {
            skippedLog.push(`${dateStr}(${skipReason})`);
          } else {
            const ref = db.collection('sessions').doc();
            batch.set(ref, {
              courseId,
              date: dateStr,
              startTime,
              endTime,
              status: 'scheduled',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            count++;
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    console.log(`[generateSessions] created=${count} skipped=[${skippedLog.join(', ')}]`);
    if (count > 0) await batch.commit();
  },
);

// ── notifySessionCancellation — notifie quand une séance est annulée ──────────
export const notifySessionCancellation = onDocumentUpdated(
  { document: 'sessions/{sessionId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === 'cancelled' || after.status !== 'cancelled') return;

    const sessionId = event.params.sessionId;
    const db = getDb();

    // Charge le cours
    const courseSnap = await db.doc(`courses/${after.courseId}`).get();
    if (!courseSnap.exists) return;
    const course = courseSnap.data()!;

    // Charge les danseurs actifs de la saison pour notification
    const dancersSnap = await db.collection('dancers')
      .where('isActive', '==', true)
      .get();

    // Collecte les accountIds pour trouver les emails et FCM tokens
    const accountIds = [...new Set(dancersSnap.docs.map(d => d.data().accountId as string))];

    // Écrit la notification Firestore
    await db.collection('notifications').add({
      type: 'session_cancelled',
      sessionId,
      courseId: after.courseId,
      courseName: course.name,
      date: after.date,
      startTime: after.startTime,
      endTime: after.endTime,
      reason: after.cancellationReason ?? '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (accountIds.length === 0) return;

    // Charge les comptes pour emails et FCM tokens
    const accountSnaps = await Promise.all(
      accountIds.slice(0, 100).map(uid => db.doc(`accounts/${uid}`).get()),
    );

    const emails: string[] = [];
    const fcmTokens: string[] = [];

    for (const snap of accountSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      if (data.email) emails.push(data.email);
      if (Array.isArray(data.fcmTokens)) fcmTokens.push(...data.fcmTokens);
    }

    // Envoie les emails
    if (emails.length > 0) {
      try {
        const configSnap = await db.doc('config/email').get();
        if (configSnap.exists) {
          const cfg = configSnap.data() as any;
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.createTransport({
            host: cfg.smtpHost ?? 'smtp.gmail.com',
            port: cfg.smtpPort ?? 587,
            secure: false,
            auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
          });
          const dateFormatted = new Date(after.date).toLocaleDateString('fr-FR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          });
          await transporter.sendMail({
            from: `"${cfg.fromName ?? 'CDV'}" <${cfg.smtpUser}>`,
            bcc: emails,
            subject: `Séance annulée — ${course.name} du ${dateFormatted}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
              <h2>Séance annulée</h2>
              <p>La séance de <strong>${course.name}</strong> prévue le <strong>${dateFormatted}</strong> de ${after.startTime} à ${after.endTime} est annulée.</p>
              ${after.cancellationReason ? `<p><strong>Motif :</strong> ${after.cancellationReason}</p>` : ''}
            </div>`,
          });
        }
      } catch (_) {
        // Ne pas faire échouer la fonction si l'email rate
      }
    }

    // Envoie les notifications FCM
    if (fcmTokens.length > 0) {
      try {
        const dateFormatted = new Date(after.date).toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long',
        });
        await admin.messaging().sendEachForMulticast({
          tokens: fcmTokens.slice(0, 500),
          notification: {
            title: 'Séance annulée',
            body: `${course.name} du ${dateFormatted} est annulé`,
          },
          data: {
            type: 'session_cancelled',
            sessionId,
            courseId: after.courseId,
          },
        });
      } catch (_) {
        // Ne pas faire échouer la fonction si FCM rate
      }
    }
  },
);

// ── processChequeOcr — OCR via Vision API REST ────────────────────────────────
export const processChequeOcr = onObjectFinalized(
  { region: 'europe-west3', bucket: 'clubvoiron-dev.firebasestorage.app' },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath.startsWith('cheques/')) return;

    const docId = filePath.split('/')[1];
    if (!docId) return;

    const db = getDb();
    const gcsUri = `gs://${event.data.bucket}/${filePath}`;
    console.log(`[processChequeOcr] Processing ${gcsUri} → chequeImages/${docId}`);

    const token = await admin.credential.applicationDefault().getAccessToken();

    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: { source: { gcsImageUri: gcsUri } },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }),
    });

    const json = await response.json() as any;

    // Surface any Vision API error in logs
    if (!response.ok || json.error) {
      const errMsg = JSON.stringify(json.error ?? json);
      console.error(`[processChequeOcr] Vision API error: ${errMsg}`);
      await db.doc(`chequeImages/${docId}`).update({
        ocrError: errMsg.slice(0, 500),
        ocrProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
        cmc7: null,
        chequeNumber: null,
        amountFromOcr: null,
        amountConfidence: 'low',
        ocrRawText: null,
      });
      return;
    }

    if (json.responses?.[0]?.error) {
      const errMsg = JSON.stringify(json.responses[0].error);
      console.error(`[processChequeOcr] Vision API per-image error: ${errMsg}`);
      await db.doc(`chequeImages/${docId}`).update({
        ocrError: errMsg.slice(0, 500),
        ocrProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
        cmc7: null,
        chequeNumber: null,
        amountFromOcr: null,
        amountConfidence: 'low',
        ocrRawText: null,
      });
      return;
    }

    const fullText: string = json.responses?.[0]?.fullTextAnnotation?.text
      ?? json.responses?.[0]?.textAnnotations?.[0]?.description
      ?? '';

    console.log(`[processChequeOcr] Raw OCR text (${fullText.length} chars): ${fullText.slice(0, 300)}`);

    // CMC7 line: 31 digits with possible spaces (bottom of French cheque)
    const cmc7Match = fullText.match(/\b\d[\d ]{28,33}\d\b/);
    const cmc7Raw = cmc7Match ? cmc7Match[0].replace(/\s+/g, '') : undefined;
    const cmc7 = cmc7Raw && cmc7Raw.length >= 20 ? cmc7Raw : undefined;

    // Amount: look for decimal numbers (handles "150,00" "1 500,00" "1500.00")
    const amountMatches = [...fullText.matchAll(/(\d[\d\s]{0,6}[,.]\d{2})\b/g)];
    let amountFromOcr: number | undefined;
    let amountConfidence: 'high' | 'medium' | 'low' = 'low';

    if (amountMatches.length > 0) {
      // Prefer the largest match that looks like a reasonable cheque amount (1€–50000€)
      const candidates = amountMatches
        .map(m => Math.round(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')) * 100))
        .filter(v => !isNaN(v) && v >= 100 && v <= 5_000_000);

      if (candidates.length > 0) {
        // French cheques show the amount at least twice (digits + words); pick the most frequent value
        const freq = new Map<number, number>();
        candidates.forEach(v => freq.set(v, (freq.get(v) ?? 0) + 1));
        const best = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
        amountFromOcr = best[0];
        amountConfidence = best[1] >= 2 ? 'high' : candidates.length === 1 ? 'medium' : 'low';
      }
    }

    const chequeNumber = cmc7 && cmc7.length >= 7 ? cmc7.slice(0, 7) : undefined;

    console.log(`[processChequeOcr] cmc7=${cmc7 ?? 'none'} amount=${amountFromOcr ?? 'none'} confidence=${amountConfidence}`);

    await db.doc(`chequeImages/${docId}`).update({
      cmc7: cmc7 ?? null,
      chequeNumber: chequeNumber ?? null,
      amountFromOcr: amountFromOcr ?? null,
      amountConfidence,
      ocrRawText: fullText.slice(0, 2000),
      ocrProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      ocrError: null,
    });
  },
);

// ── scheduledChequeImageDeletion — supprime les images après 90 jours ─────────
export const scheduledChequeImageDeletion = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west3' },
  async () => {
    const db = getDb();
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('chequeImages')
      .where('scheduledDeletionAt', '<=', now)
      .get();

    const bucket = admin.storage().bucket();
    await Promise.all(snap.docs.map(async (docSnap) => {
      const data = docSnap.data();
      if (data.storagePath) {
        try { await bucket.file(data.storagePath).delete(); } catch (_) {}
      }
      await docSnap.ref.delete();
    }));
  },
);
