import { onDocumentCreated, onDocumentWritten, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { google } from 'googleapis';

const helloassoClientId = defineSecret('HELLOASSO_CLIENT_ID');
const helloassoClientSecret = defineSecret('HELLOASSO_CLIENT_SECRET');

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

    // Séance ponctuelle : une seule session à la date choisie, pas de
    // récurrence hebdomadaire ni de logique d'annulation automatique
    // (vacances/jours fériés) — l'admin a choisi cette date en connaissance
    // de cause.
    if (after.isOneOff) {
      if (!after.oneOffDate) return;
      const existingSnap = await db.collection('sessions')
        .where('courseId', '==', courseId)
        .where('date', '==', after.oneOffDate)
        .get();
      if (!existingSnap.empty) return;
      await db.collection('sessions').add({
        courseId,
        date: after.oneOffDate,
        startTime: after.startTime,
        endTime: after.endTime,
        status: 'scheduled',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

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

// ── ensureSessionForDate — crée à la volée le doc session d'un créneau ────────
// Certains cours n'ont pas encore de session générée pour une date donnée
// (créneau "virtuel" affiché côté client à partir du cours récurrent, ex. si
// generateSessions n'a jamais tourné sur ce cours). La fiche détail de séance
// a besoin d'un id de session réel pour rattacher vidéo/programme — cette
// fonction le crée si besoin (les danseurs n'ont pas le droit d'écrire
// directement dans `sessions`, seul un admin/permission /admin/courses peut).
export const ensureSessionForDate = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');

    const { courseId, date } = request.data as { courseId: string; date: string };
    if (!courseId || !date) throw new HttpsError('invalid-argument', 'courseId et date requis');

    const db = getDb();

    const existingSnap = await db.collection('sessions')
      .where('courseId', '==', courseId)
      .where('date', '==', date)
      .limit(1)
      .get();
    if (!existingSnap.empty) return { sessionId: existingSnap.docs[0]!.id };

    const courseSnap = await db.doc(`courses/${courseId}`).get();
    if (!courseSnap.exists) throw new HttpsError('not-found', 'Cours introuvable');
    const course = courseSnap.data()!;

    const ref = db.collection('sessions').doc();
    await ref.set({
      courseId,
      date,
      startTime: course.startTime,
      endTime: course.endTime,
      status: 'scheduled',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { sessionId: ref.id };
  },
);

// ── getCalendarSyncLink — génère/retourne le lien d'abonnement iCal d'un danseur
export const getCalendarSyncLink = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const uid = request.auth.uid;
    const { dancerId } = request.data as { dancerId: string };
    if (!dancerId) throw new HttpsError('invalid-argument', 'dancerId requis');

    const db = getDb();
    const dancerSnap = await db.doc(`dancers/${dancerId}`).get();
    if (!dancerSnap.exists || dancerSnap.data()?.accountId !== uid) {
      throw new HttpsError('permission-denied', 'Danseur invalide');
    }
    const dancerRoles: string[] = dancerSnap.data()?.roles ?? [];

    const settingsSnap = await db.doc('appSettings/main').get();
    const syncRoles: string[] = settingsSnap.data()?.calendarSyncRoles ?? [];
    if (!dancerRoles.includes('admin') && !dancerRoles.some(r => syncRoles.includes(r))) {
      throw new HttpsError('permission-denied', 'Accès refusé');
    }

    const existingSnap = await db.collection('calendarTokens')
      .where('dancerId', '==', dancerId)
      .limit(1)
      .get();

    let token: string;
    if (!existingSnap.empty) {
      token = existingSnap.docs[0]!.id;
    } else {
      token = crypto.randomUUID();
      await db.collection('calendarTokens').doc(token).set({
        dancerId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { url: `https://europe-west3-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/icalFeed?token=${token}` };
  },
);

// ── icalFeed — flux iCal en lecture seule du planning du club ─────────────────
export const icalFeed = onRequest({ region: 'europe-west3' }, async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) { res.status(400).send('token requis'); return; }

  const db = getDb();
  const tokenSnap = await db.doc(`calendarTokens/${token}`).get();
  if (!tokenSnap.exists) { res.status(404).send('Lien invalide'); return; }
  const { dancerId } = tokenSnap.data()!;

  const dancerSnap = await db.doc(`dancers/${dancerId}`).get();
  if (!dancerSnap.exists) { res.status(404).send('Danseur introuvable'); return; }
  const dancerRoles: string[] = dancerSnap.data()?.roles ?? [];

  const settingsSnap = await db.doc('appSettings/main').get();
  const syncRoles: string[] = settingsSnap.data()?.calendarSyncRoles ?? [];
  const noteViewRoles: string[] = settingsSnap.data()?.sessionNoteViewRoles ?? [];
  const isAdmin = dancerRoles.includes('admin');
  // Revérifié à chaque appel : si le rôle a été retiré au danseur depuis la
  // génération du lien, le flux doit cesser de fonctionner immédiatement.
  if (!isAdmin && !dancerRoles.some(r => syncRoles.includes(r))) {
    res.status(403).send('Accès refusé');
    return;
  }
  const canViewNote = isAdmin || dancerRoles.some(r => noteViewRoles.includes(r));

  const today = new Date();
  const startStr = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + 90);
  const endStr = end.toISOString().slice(0, 10);

  const [sessionsSnap, coursesSnap, stylesSnap, levelsSnap, roomsSnap] = await Promise.all([
    db.collection('sessions').where('date', '>=', startStr).where('date', '<=', endStr).get(),
    db.collection('courses').get(),
    db.collection('danceStyles').get(),
    db.collection('levels').get(),
    db.collection('rooms').get(),
  ]);

  const courses = new Map(coursesSnap.docs.map(d => [d.id, d.data()]));
  const styles = new Map(stylesSnap.docs.map(d => [d.id, d.data()]));
  const levels = new Map(levelsSnap.docs.map(d => [d.id, d.data()]));
  const rooms = new Map(roomsSnap.docs.map(d => [d.id, d.data()]));

  const escapeIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const toIcsDateTime = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CDV//Planning//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Planning CDV',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ];

  for (const d of sessionsSnap.docs) {
    const s = d.data();
    const course = courses.get(s.courseId);
    if (!course) continue;
    const style = styles.get(course.danceStyleId);
    const level = levels.get(course.levelId);
    const room = rooms.get(course.roomId);
    const cancelled = s.status === 'cancelled';
    const summary = `${cancelled ? 'Annulé : ' : ''}${course.name ?? style?.name ?? 'Cours'}`;
    const descParts: string[] = [];
    if (level?.name) descParts.push(level.name);
    if (cancelled && s.cancellationReason) descParts.push(`Annulé : ${s.cancellationReason}`);
    if (canViewNote && s.programNote) descParts.push(s.programNote);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${d.id}@cdv-app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${toIcsDateTime(s.date, s.startTime)}`,
      `DTEND:${toIcsDateTime(s.date, s.endTime)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      ...(room?.name ? [`LOCATION:${escapeIcs(room.name)}`] : []),
      ...(descParts.length ? [`DESCRIPTION:${escapeIcs(descParts.join(' — '))}`] : []),
      ...(cancelled ? ['STATUS:CANCELLED'] : ['STATUS:CONFIRMED']),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="planning-cdv.ics"');
  res.send(lines.join('\r\n'));
});

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
  { region: 'europe-west3', bucket: `${process.env.GCLOUD_PROJECT}.firebasestorage.app` },
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

// ── createHelloAssoCheckout — crée un intent de paiement HelloAsso ────────────
export const createHelloAssoCheckout = onCall(
  { region: 'europe-west3', secrets: [helloassoClientId, helloassoClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'auth_required');

    const { membershipId, groupId, amount } = request.data as {
      membershipId?: string; groupId?: string; amount: number;
    };

    if (!membershipId && !groupId) throw new HttpsError('invalid-argument', 'membershipId_or_groupId_required');
    if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'amount_required');

    const clientId = helloassoClientId.value().trim();
    const clientSecret = helloassoClientSecret.value().trim();
    const orgSlug = process.env.HELLOASSO_ORG_SLUG!;
    const apiUrl = process.env.HELLOASSO_API_URL ?? 'https://api.helloasso.com';
    const appUrl = process.env.APP_URL ?? 'https://app-club-web.vercel.app';

    // Pré-crée le doc Firestore pour avoir un ID à passer en metadata
    const db = getDb();
    const paymentRef = db.collection('helloassoPayments').doc();

    // Obtient le token OAuth HelloAsso (client_credentials)
    const tokenRes = await fetch(`${apiUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[createHelloAssoCheckout] Token error:', err);
      throw new HttpsError('internal', 'helloasso_token_failed');
    }
    const tokenData = await tokenRes.json() as { access_token: string };

    // Crée l'intent de paiement HelloAsso
    const returnBase = `${appUrl}/membership`;
    const checkoutRes = await fetch(`${apiUrl}/v5/organizations/${orgSlug}/checkout-intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        totalAmount: amount,
        initialAmount: amount,
        itemName: 'Cotisation CDV',
        backUrl: returnBase,
        errorUrl: `${returnBase}?status=error`,
        returnUrl: `${returnBase}?status=success`,
        containsDonation: false,
        metadata: { paymentId: paymentRef.id },
      }),
    });
    if (!checkoutRes.ok) {
      const err = await checkoutRes.text();
      console.error('[createHelloAssoCheckout] Checkout error:', err);
      throw new HttpsError('internal', 'helloasso_checkout_failed');
    }
    const checkout = await checkoutRes.json() as { id: string; redirectUrl: string };

    await paymentRef.set({
      userId: request.auth.uid,
      membershipId: membershipId ?? null,
      groupId: groupId ?? null,
      amount,
      status: 'pending',
      checkoutIntentId: checkout.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[createHelloAssoCheckout] intent=${checkout.id} paymentRef=${paymentRef.id} amount=${amount}`);
    return { redirectUrl: checkout.redirectUrl };
  },
);

// ── webhookHelloAsso — reçoit les notifications de paiement HelloAsso ─────────
export const webhookHelloAsso = onRequest(
  { region: 'europe-west3' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const payload = req.body as any;
    const eventType: string = payload.eventType ?? '';
    const data = payload.data ?? {};
    console.log(`[webhookHelloAsso] eventType=${eventType} state=${data.state ?? 'n/a'} payload=${JSON.stringify(payload)}`);

    // On traite les Order (items[].state=Processed) et Payment (state=Authorized)
    const isOrderProcessed = eventType === 'Order' && Array.isArray(data.items) &&
      data.items.some((i: any) => i.state === 'Processed' || i.state === 'Authorized');
    const isPaymentAuthorized = eventType === 'Payment' && data.state === 'Authorized';

    if (!isOrderProcessed && !isPaymentAuthorized) {
      res.status(200).json({ ok: true });
      return;
    }

    const db = getDb();
    let paymentSnap: admin.firestore.DocumentSnapshot | null = null;

    // 1. Essai via metadata.paymentId — HelloAsso envoie metadata au niveau racine du payload
    const metaPaymentId: string | undefined =
      payload.metadata?.paymentId ??
      data.metadata?.paymentId ??
      data.meta?.paymentId ??
      data.order?.metadata?.paymentId ??
      data.order?.meta?.paymentId;

    if (metaPaymentId) {
      const snap = await db.doc(`helloassoPayments/${metaPaymentId}`).get();
      if (snap.exists && snap.data()?.status === 'pending') paymentSnap = snap;
    }

    // 2. Fallback : email du payeur → userId → dernier paiement pending
    if (!paymentSnap) {
      const payerEmail: string | undefined = data.payer?.email ?? data.order?.payer?.email;
      if (payerEmail) {
        try {
          const user = await getAuth().getUserByEmail(payerEmail);
          const q = await db.collection('helloassoPayments')
            .where('userId', '==', user.uid)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
          if (!q.empty) paymentSnap = q.docs[0]!;
        } catch (e) {
          console.warn('[webhookHelloAsso] getUserByEmail failed:', payerEmail, e);
        }
      }
    }

    if (!paymentSnap) {
      console.warn('[webhookHelloAsso] No matching pending payment — eventType:', eventType, 'data:', JSON.stringify(data).slice(0, 400));
      res.status(200).json({ ok: true });
      return;
    }

    const snapRef = paymentSnap.ref;
    const helloassoOrderId = data.order?.id ?? data.id ?? null;

    // Transaction pour éviter le double-traitement (Order + Payment arrivent en même temps)
    // IMPORTANT: tous les tx.get() doivent précéder tous les tx.update()/tx.set()
    const processed = await db.runTransaction(async (tx) => {
      // ── 1. READS ──────────────────────────────────────────────────────────
      const fresh = await tx.get(snapRef);
      if (fresh.data()?.status !== 'pending') return false;

      const payment = fresh.data()!;
      const totalAmount: number = payment.amount;

      const memberRef = payment.membershipId ? db.doc(`memberships/${payment.membershipId}`) : null;
      const groupRef = payment.groupId ? db.doc(`paymentGroups/${payment.groupId}`) : null;

      const memberSnap = memberRef ? await tx.get(memberRef) : null;
      const groupSnap = groupRef ? await tx.get(groupRef) : null;

      // ── 2. WRITES ─────────────────────────────────────────────────────────
      tx.update(snapRef, {
        status: 'authorized',
        helloassoOrderId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const todayIso = new Date().toISOString().slice(0, 10);
      const installRef = db.collection('paymentInstallments').doc();
      tx.set(installRef, {
        membershipId: payment.membershipId ?? null,
        groupId: payment.groupId ?? null,
        userId: payment.userId,
        amount: totalAmount,
        method: 'helloasso',
        status: 'paid',
        expectedDate: todayIso,
        actualDate: todayIso,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (memberRef && memberSnap) {
        const d = memberSnap.data() ?? {};
        const newTotalPaid = (d.totalPaid ?? 0) + totalAmount;
        const updates: Record<string, unknown> = {
          totalPaid: admin.firestore.FieldValue.increment(totalAmount),
          installmentIds: admin.firestore.FieldValue.arrayUnion(installRef.id),
        };
        if ((d.totalDue ?? 0) > 0 && newTotalPaid >= (d.totalDue ?? 0)) {
          updates.paymentPlanStatus = 'approved';
          updates.status = 'active';
        }
        tx.update(memberRef, updates);
      } else if (groupRef && groupSnap) {
        const d = groupSnap.data() ?? {};
        const newTotalPaid = (d.totalPaid ?? 0) + totalAmount;
        const updates: Record<string, unknown> = {
          totalPaid: admin.firestore.FieldValue.increment(totalAmount),
          installmentIds: admin.firestore.FieldValue.arrayUnion(installRef.id),
        };
        if ((d.totalDue ?? 0) > 0 && newTotalPaid >= (d.totalDue ?? 0)) {
          updates.paymentPlanStatus = 'approved';
          updates.status = 'active';
        }
        tx.update(groupRef, updates);
      }

      console.log(`[webhookHelloAsso] OK paymentSnap=${snapRef.id} amount=${totalAmount}`);
      return true;
    });

    if (!processed) {
      console.log('[webhookHelloAsso] Already processed (skipped):', snapRef.id);
    }
    res.status(200).json({ ok: true });
  },
);

// ── recordAttendance — enregistre la présence depuis le kiosque ───────────────
export const recordAttendance = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const db = getDb();
    const { qrUid, dancerId, kioskSessionId } = (request.data ?? {}) as {
      qrUid?: string;
      dancerId?: string;
      kioskSessionId: string;
    };

    if (!kioskSessionId) throw new HttpsError('invalid-argument', 'kioskSessionId requis');
    if (!qrUid && !dancerId) throw new HttpsError('invalid-argument', 'qrUid ou dancerId requis');

    // 1. Vérifier le kiosque
    const kioskRef = db.doc(`kioskSessions/${kioskSessionId}`);
    const kioskSnap = await kioskRef.get();
    if (!kioskSnap.exists) throw new HttpsError('not-found', 'Session kiosque introuvable');
    const kiosk = kioskSnap.data()!;
    if (kiosk.status !== 'active') throw new HttpsError('failed-precondition', 'Session kiosque fermée');

    const sessionId: string = kiosk.sessionId;
    const courseId: string = kiosk.courseId;

    // 2. Trouver le danseur
    let dancer: admin.firestore.DocumentData | null = null;
    let dancerRef: admin.firestore.DocumentReference | null = null;

    if (qrUid) {
      // Nouveau format : QR encode dancer.id directement
      const directSnap = await db.doc(`dancers/${qrUid}`).get();
      if (directSnap.exists && directSnap.data()?.isActive !== false) {
        dancerRef = directSnap.ref;
        dancer = directSnap.data()!;
      } else {
        // Ancien format (compat) : QR encodait accountId
        const q = await db.collection('dancers').where('accountId', '==', qrUid).where('isActive', '==', true).limit(1).get();
        if (q.empty) throw new HttpsError('not-found', 'Danseur introuvable pour ce QR code');
        dancerRef = q.docs[0].ref;
        dancer = q.docs[0].data();
      }
    } else {
      dancerRef = db.doc(`dancers/${dancerId}`);
      const snap = await dancerRef.get();
      if (!snap.exists) throw new HttpsError('not-found', 'Danseur introuvable');
      dancer = snap.data()!;
      if (!dancer.isActive) throw new HttpsError('failed-precondition', 'Compte danseur inactif');
    }

    const resolvedDancerId = dancerRef.id;
    const today = new Date().toISOString().slice(0, 10);

    // 3. Vérifier doublon (même danseur, même séance aujourd'hui)
    const dupQ = await db.collection('attendances')
      .where('dancerId', '==', resolvedDancerId)
      .where('sessionId', '==', sessionId)
      .where('date', '==', today)
      .limit(1)
      .get();
    if (!dupQ.empty) {
      return {
        status: 'already_registered',
        dancerName: `${dancer.firstName} ${dancer.lastName}`,
        memberNumber: dancer.memberNumber ?? null,
      };
    }

    // 4. Vérifier limites essai — dépassement = alerte, pas de blocage : la
    // présence est quand même enregistrée avec un tag spécial pour que le
    // professeur repère facilement les danseurs hors limites d'essai.
    const isTrial = (dancer.roles as string[])?.includes('trial');
    let trialAlert: 'sessions_exceeded' | 'expired' | null = null;
    if (isTrial) {
      const settingsSnap = await db.doc('appSettings/main').get();
      const settings = settingsSnap.data() ?? {};
      const trialMode: 'sessions' | 'days' | 'fixed' = settings.trialMode ?? 'sessions';
      const used: number = (dancer.trialSessionsUsed as number) ?? 0;

      if (trialMode === 'sessions') {
        const maxTrialSessions: number = settings.trialMaxSessions ?? 3;
        if (used >= maxTrialSessions) trialAlert = 'sessions_exceeded';
      } else if (trialMode === 'days') {
        const expiresAt = dancer.trialExpiresAt as admin.firestore.Timestamp | undefined;
        if (expiresAt && expiresAt.toDate() < new Date()) trialAlert = 'expired';
      } else if (trialMode === 'fixed') {
        const trialEndDate: string | undefined = settings.trialEndDate;
        if (trialEndDate && today > trialEndDate) trialAlert = 'expired';
      }
    }

    // 5. Déterminer le statut de présence
    const regQ = await db.collection('registrations')
      .where('userId', '==', dancer.accountId)
      .where('courseId', '==', courseId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    const attendanceStatus = regQ.empty ? 'walk-in' : 'registered';

    // 6. Transaction : créer présence + incrémenter compteurs
    const attendanceRef = db.collection('attendances').doc();
    await db.runTransaction(async (tx) => {
      const kioskFresh = await tx.get(kioskRef);
      if (kioskFresh.data()?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Session kiosque fermée');
      }
      const sessionRef = db.doc(`sessions/${sessionId}`);

      tx.set(attendanceRef, {
        dancerId: resolvedDancerId,
        sessionId,
        date: today,
        scannedAt: admin.firestore.FieldValue.serverTimestamp(),
        method: qrUid ? 'qr' : 'manual',
        status: attendanceStatus,
        ...(trialAlert ? { trialAlert } : {}),
      });

      tx.update(sessionRef, {
        actualAttendees: admin.firestore.FieldValue.increment(1),
      });

      tx.update(kioskRef, {
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (isTrial) {
        tx.update(dancerRef!, {
          trialSessionsUsed: admin.firestore.FieldValue.increment(1),
        });
      }
    });

    // 7. Notification push (best-effort)
    try {
      const accountSnap = await db.doc(`accounts/${dancer.accountId}`).get();
      const fcmToken: string | undefined = accountSnap.data()?.fcmToken as string | undefined;
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: 'Présence enregistrée',
            body: `Bonne séance, ${dancer.firstName} !`,
          },
        });
      }
    } catch { /* notification non bloquante */ }

    return {
      status: attendanceStatus,
      isTrial,
      trialAlert,
      dancerName: `${dancer.firstName} ${dancer.lastName}`,
      memberNumber: dancer.memberNumber ?? null,
    };
  },
);

// ── detectIdleKiosks — ferme automatiquement les kiosques inactifs ─────────────
export const detectIdleKiosks = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west3' },
  async () => {
    const db = getDb();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const idleQ = await db.collection('kioskSessions')
      .where('status', '==', 'active')
      .where('lastActivityAt', '<', twoHoursAgo)
      .get();

    if (idleQ.empty) return;

    const batch = db.batch();
    idleQ.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'closed',
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`[detectIdleKiosks] Fermé ${idleQ.size} kiosque(s) inactif(s)`);
  },
);

// Rôles combinés (compte + tous les danseurs) de l'appelant — utilisé pour
// comparer à une liste de rôles configurable (ex: sessionVideoUploadRoles).
async function getCallerRoles(db: FirebaseFirestore.Firestore, uid: string): Promise<string[]> {
  const accountSnap = await db.doc(`accounts/${uid}`).get();
  const accountRoles: string[] = accountSnap.data()?.roles ?? [];
  const dancerSnap = await db.collection('dancers').where('accountId', '==', uid).get();
  const dancerRoles = dancerSnap.docs.flatMap(d => (d.data().roles as string[] | undefined) ?? []);
  return [...new Set([...accountRoles, ...dancerRoles])];
}

// ── registerMedia — crée un doc media après upload Firebase Storage ───────────
export const registerMedia = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');

    const {
      storagePath, sourceUrl, title, description, type,
      seasonId, attachedTo, mimeType, sizeBytes, durationSeconds, isPublic, actingDancerId,
    } = request.data as {
      storagePath: string; sourceUrl: string; title: string; description?: string;
      type: 'audio' | 'video'; seasonId?: string | null; attachedTo?: string | null;
      mimeType: string; sizeBytes: number; durationSeconds?: number; isPublic: boolean;
      actingDancerId?: string | null;
    };

    const db = getDb();
    const uid = request.auth.uid;

    const accountSnap = await db.doc(`accounts/${uid}`).get();
    let isAdmin = accountSnap.data()?.roles?.includes('admin') === true;
    // Le modèle d'admin de l'app inclut aussi les danseurs ayant le rôle admin
    // (cf. web admin/layout.tsx). Sinon un admin-danseur ne peut pas téléverser.
    if (!isAdmin) {
      const dancerAdminSnap = await db.collection('dancers')
        .where('accountId', '==', uid)
        .where('roles', 'array-contains', 'admin')
        .get();
      isAdmin = !dancerAdminSnap.empty;
    }

    let courseId: string | null = null;
    let danceStyleId: string | null = null;
    let levelId: string | null = null;
    let sessionId: string | null = null;
    let sessionDate: string | null = null;
    let sessionStartTime: string | null = null;

    if (attachedTo?.startsWith('session:')) {
      sessionId = attachedTo.replace('session:', '');
      const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Séance introuvable');
      const sessionData = sessionSnap.data()!;
      courseId = sessionData.courseId;
      sessionDate = sessionData.date ?? null;
      sessionStartTime = sessionData.startTime ?? null;

      const courseSnap = courseId ? await db.doc(`courses/${courseId}`).get() : null;
      const courseData = courseSnap?.data() ?? {};
      danceStyleId = courseData.danceStyleId ?? null;
      levelId = courseData.levelId ?? null;

      if (!isAdmin) {
        const settingsSnap = await db.doc('appSettings/main').get();
        const uploadRoles: string[] = settingsSnap.data()?.sessionVideoUploadRoles ?? [];
        // Rôles du danseur ACTIF (celui affiché dans la fiche détail), pas de
        // tout le compte — évite qu'un autre danseur du même compte famille
        // (ex: un moniteur) ne donne ses droits au danseur affiché.
        let effectiveRoles: string[];
        if (actingDancerId) {
          const dancerSnap = await db.doc(`dancers/${actingDancerId}`).get();
          if (!dancerSnap.exists || dancerSnap.data()?.accountId !== uid) {
            throw new HttpsError('permission-denied', 'Danseur invalide');
          }
          effectiveRoles = dancerSnap.data()?.roles ?? [];
        } else {
          effectiveRoles = await getCallerRoles(db, uid);
        }
        if (!effectiveRoles.some(r => uploadRoles.includes(r))) {
          throw new HttpsError('permission-denied', 'Accès refusé');
        }
      }
    } else if (attachedTo?.startsWith('course:')) {
      courseId = attachedTo.replace('course:', '');
      const courseSnap = await db.doc(`courses/${courseId}`).get();
      if (!courseSnap.exists) throw new HttpsError('not-found', 'Cours introuvable');
      const courseData = courseSnap.data()!;
      danceStyleId = courseData.danceStyleId ?? null;

      if (!isAdmin) {
        const instructorId: string | undefined = courseData.instructorId;
        if (!instructorId) throw new HttpsError('permission-denied', 'Accès refusé');
        const dancerSnap = await db.collection('dancers')
          .where('accountId', '==', uid).get();
        const myDancerIds = dancerSnap.docs.map(d => d.id);
        if (!myDancerIds.includes(instructorId)) {
          throw new HttpsError('permission-denied', 'Accès refusé');
        }
      }
    } else if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Seuls les administrateurs peuvent ajouter des médias généraux');
    }

    const mediaRef = db.collection('media').doc();
    await mediaRef.set({
      title,
      description: description ?? null,
      type,
      seasonId: seasonId ?? null,
      storageProvider: 'firebase',
      storagePath,
      sourceUrl,
      uploadedBy: uid,
      attachedTo: attachedTo ?? null,
      courseId,
      danceStyleId,
      levelId,
      sessionId,
      sessionDate,
      sessionStartTime,
      mimeType,
      sizeBytes,
      durationSeconds: durationSeconds ?? null,
      isPublic: isPublic ?? false,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      encodingStatus: type === 'video' ? 'pending' : null,
    });

    return { id: mediaRef.id };
  },
);

// ── deleteMedia — supprime un média (doc Firestore + fichier Storage) ──────────
// Réservé aux admins (compte OU danseur admin, même logique que registerMedia).
export const deleteMedia = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');

    const { mediaId } = request.data as { mediaId: string };
    if (!mediaId) throw new HttpsError('invalid-argument', 'mediaId requis');

    const db = getDb();
    const uid = request.auth.uid;

    const accountSnap = await db.doc(`accounts/${uid}`).get();
    let isAdmin = accountSnap.data()?.roles?.includes('admin') === true;
    if (!isAdmin) {
      const dancerAdminSnap = await db.collection('dancers')
        .where('accountId', '==', uid)
        .where('roles', 'array-contains', 'admin')
        .get();
      isAdmin = !dancerAdminSnap.empty;
    }
    if (!isAdmin) throw new HttpsError('permission-denied', 'Seuls les administrateurs peuvent supprimer un média');

    const mediaRef = db.doc(`media/${mediaId}`);
    const mediaSnap = await mediaRef.get();
    if (!mediaSnap.exists) return { ok: true }; // déjà supprimé

    const storagePath = mediaSnap.data()?.storagePath as string | undefined;
    if (storagePath) {
      try {
        await admin.storage().bucket().file(storagePath).delete();
      } catch (err) {
        console.warn('[deleteMedia] fichier Storage déjà absent ou non supprimable:', storagePath);
      }
    }
    await mediaRef.delete();
    return { ok: true };
  },
);

// ── deleteDancerAccount — anonymise la fiche d'un danseur à sa demande ────────
export const deleteDancerAccount = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const uid = request.auth.uid;

    const { dancerId } = request.data as { dancerId: string };
    if (!dancerId) throw new HttpsError('invalid-argument', 'dancerId requis');

    const db = getDb();
    const dancerRef = db.doc(`dancers/${dancerId}`);
    const dancerSnap = await dancerRef.get();
    if (!dancerSnap.exists || dancerSnap.data()?.accountId !== uid) {
      throw new HttpsError('permission-denied', 'Danseur invalide');
    }

    // Anonymisation : les données personnelles sont effacées, mais le doc
    // danseur est conservé (memberNumber, id) car des paiements/adhésions
    // peuvent y faire référence pour les obligations comptables.
    await dancerRef.update({
      firstName: 'Utilisateur',
      lastName: 'supprimé',
      firstNameLower: 'utilisateur',
      lastNameLower: 'supprime',
      photoUrl: admin.firestore.FieldValue.delete(),
      birthDate: admin.firestore.FieldValue.delete(),
      phone: admin.firestore.FieldValue.delete(),
      street: admin.firestore.FieldValue.delete(),
      postalCode: admin.firestore.FieldValue.delete(),
      city: admin.firestore.FieldValue.delete(),
      emergencyContact: admin.firestore.FieldValue.delete(),
      gender: admin.firestore.FieldValue.delete(),
      profession: admin.firestore.FieldValue.delete(),
      medicalNotes: admin.firestore.FieldValue.delete(),
      healthCertificate: admin.firestore.FieldValue.delete(),
      customFields: admin.firestore.FieldValue.delete(),
      notificationPreferences: admin.firestore.FieldValue.delete(),
      levelsByStyle: admin.firestore.FieldValue.delete(),
      roles: [],
      isActive: false,
      isDeleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await admin.storage().bucket().file(`dancers/${dancerId}/photo.jpg`).delete();
    } catch {
      // pas de photo, ou déjà absente
    }

    // Si c'était le dernier danseur actif du compte, on supprime aussi le
    // compte (login) — sinon le compte reste pour les autres danseurs.
    const remainingSnap = await db.collection('dancers').where('accountId', '==', uid).get();
    const stillHasActiveDancer = remainingSnap.docs.some(
      d => d.id !== dancerId && d.data().isDeleted !== true,
    );

    let accountDeleted = false;
    if (!stillHasActiveDancer) {
      await db.doc(`accounts/${uid}`).set(
        { isDeleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );
      try {
        await admin.auth().deleteUser(uid);
      } catch {
        // déjà supprimé ou non trouvé
      }
      accountDeleted = true;
    }

    return { accountDeleted };
  },
);

// ── flagProfileCompletion — marque une fiche danseur à compléter ─────────────
// Utilisée quand un tiers (paiement pour un danseur d'un autre compte) détecte
// des champs obligatoires manquants mais n'a pas les droits pour les remplir
// à sa place. Le titulaire du danseur sera bloqué en connexion suivante tant
// qu'il n'aura pas complété sa fiche (cf. guard côté app).
export const flagProfileCompletion = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const { dancerId } = request.data as { dancerId: string };
    if (!dancerId) throw new HttpsError('invalid-argument', 'dancerId requis');

    const db = getDb();
    const dancerRef = db.doc(`dancers/${dancerId}`);
    const dancerSnap = await dancerRef.get();
    if (!dancerSnap.exists) throw new HttpsError('not-found', 'Danseur introuvable');

    await dancerRef.update({ profileCompletionRequired: true });
    return { ok: true };
  },
);

// ── getEnrolledDancerIds — danseurs déjà engagés sur une cotisation ───────────
// Utilisée pour empêcher la création d'un doublon (même danseur, même saison)
// que ce soit par le même payeur ou un autre compte. "approved" et "pending"
// comptent tous les deux comme "déjà engagé" — un plan en attente de
// validation ne doit pas pouvoir être dupliqué. Nécessite l'Admin SDK car un
// membre normal n'a le droit de lire que ses propres cotisations côté client.
export const getEnrolledDancerIds = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const { seasonId } = request.data as { seasonId: string };
    if (!seasonId) throw new HttpsError('invalid-argument', 'seasonId requis');

    const db = getDb();
    const snap = await db.collection('memberships')
      .where('seasonId', '==', seasonId)
      .where('paymentPlanStatus', 'in', ['approved', 'pending'])
      .select('dancerId', 'userId')
      .get();

    const enrolledIds = new Set<string>();
    const userIdsToLookup: string[] = [];

    for (const d of snap.docs) {
      const dancerId = d.data().dancerId as string | undefined;
      if (dancerId) {
        enrolledIds.add(dancerId);
      } else {
        const userId = d.data().userId as string | undefined;
        if (userId) userIdsToLookup.push(userId);
      }
    }

    if (userIdsToLookup.length > 0) {
      const accountDocs = await Promise.all(
        userIdsToLookup.map(uid => db.doc(`accounts/${uid}`).get()),
      );
      for (const acc of accountDocs) {
        if (acc.exists) {
          const dancerIds: string[] = acc.data()?.dancerIds ?? [];
          if (dancerIds[0]) enrolledIds.add(dancerIds[0]);
        }
      }
    }

    return { dancerIds: [...enrolledIds] };
  },
);

// ── encodeMedia — compresse les vidéos déclenchée par création du doc Firestore
export const encodeMedia = onDocumentCreated(
  { document: 'media/{id}', region: 'europe-west3', memory: '4GiB', timeoutSeconds: 540, cpu: 2 },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    if (data.type !== 'video') { console.log('[encodeMedia] skip: not a video'); return; }
    if (data.encodingStatus !== 'pending') { console.log('[encodeMedia] skip: status is', data.encodingStatus); return; }

    const filePath = data.storagePath as string;
    console.log(`[encodeMedia] triggered for doc ${event.params.id} | path: ${filePath}`);

    const mediaRef = event.data!.ref;
    await mediaRef.update({ encodingStatus: 'encoding' });

    const bucket = admin.storage().bucket();
    const tmpInput = path.join(os.tmpdir(), `cdv_in_${Date.now()}`);
    const tmpOutput = path.join(os.tmpdir(), `cdv_out_${Date.now()}.mp4`);

    try {
      console.log('[encodeMedia] downloading...');
      await bucket.file(filePath).download({ destination: tmpInput });
      console.log(`[encodeMedia] downloaded ${Math.round(fs.statSync(tmpInput).size / 1024 / 1024)}Mo`);

      if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tmpInput)
          .outputOptions(['-vcodec libx264', '-crf 28', '-preset fast', '-acodec aac', '-b:a 128k', '-movflags +faststart'])
          .output(tmpOutput)
          .on('progress', (p: any) => console.log(`[encodeMedia] ${Math.round(p.percent ?? 0)}%`))
          .on('end', () => { console.log('[encodeMedia] ffmpeg done'); resolve(); })
          .on('error', (err: Error) => { console.error('[encodeMedia] ffmpeg error:', err.message); reject(err); })
          .run();
      });

      const stats = fs.statSync(tmpOutput);
      console.log(`[encodeMedia] output: ${Math.round(stats.size / 1024 / 1024)}Mo`);

      const newToken = crypto.randomUUID();
      await bucket.upload(tmpOutput, {
        destination: filePath,
        metadata: {
          contentType: 'video/mp4',
          metadata: { encoded: 'true', firebaseStorageDownloadTokens: newToken },
        },
      });

      const bucketName = bucket.name;
      const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${newToken}`;

      const duration = await new Promise<number | undefined>(resolve => {
        ffmpeg.ffprobe(tmpOutput, (err: Error | null, d: any) => {
          resolve(err ? undefined : Math.round(d?.format?.duration ?? 0) || undefined);
        });
      });

      await mediaRef.update({
        encodingStatus: 'done',
        sizeBytes: stats.size,
        sourceUrl: newUrl,
        ...(duration && { durationSeconds: duration }),
      });
      console.log('[encodeMedia] done');
    } catch (err) {
      console.error('[encodeMedia] error:', err);
      await mediaRef.update({ encodingStatus: 'error' });
    } finally {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
    }
  },
);

// ── resolveRecipientAccountIds — logique partagée ─────────────────────────────
async function resolveRecipientAccountIds(
  db: admin.firestore.Firestore,
  channel: admin.firestore.DocumentData,
): Promise<string[]> {
  if (channel.type === 'main') {
    const snap = await db.collection('accounts').get();
    return snap.docs.map(d => d.id);
  }
  if (channel.type === 'course' && channel.targetId) {
    const snap = await db.collection('accounts')
      .where('registeredCourseIds', 'array-contains', channel.targetId)
      .get();
    return snap.docs.map(d => d.id);
  }
  if (channel.type === 'style' && channel.targetId) {
    const snap = await db.collection('dancers').where('isActive', '==', true).get();
    const ids = new Set<string>();
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.levelsByStyle && channel.targetId in data.levelsByStyle) {
        ids.add(data.accountId as string);
      }
    });
    return [...ids];
  }
  if (channel.type === 'custom' && Array.isArray(channel.customMemberIds)) {
    return channel.customMemberIds as string[];
  }
  return [];
}

// ── previewNotificationRecipients ─────────────────────────────────────────────
export const previewNotificationRecipients = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Non authentifié');
    const { channelId } = request.data as { channelId: string };
    if (!channelId) throw new HttpsError('invalid-argument', 'channelId manquant');

    const db = getDb();
    const channelSnap = await db.doc(`notificationChannels/${channelId}`).get();
    if (!channelSnap.exists) throw new HttpsError('not-found', 'Canal introuvable');

    const accountIds = await resolveRecipientAccountIds(db, channelSnap.data()!);

    // Vérifie opt-out au niveau danseur : si tous les danseurs du compte ont opt-out, exclure le compte
    const dancersSnap = await db.collection('dancers').get();
    const dancersByAccount = new Map<string, admin.firestore.DocumentData[]>();
    dancersSnap.docs.forEach(d => {
      const data = d.data();
      const aid = data.accountId as string;
      if (!aid) return;
      if (!dancersByAccount.has(aid)) dancersByAccount.set(aid, []);
      dancersByAccount.get(aid)!.push(data);
    });

    let recipientCount = 0;
    for (const accountId of accountIds) {
      const dancers = dancersByAccount.get(accountId) ?? [];
      // Si au moins un danseur du compte n'a pas opt-out → compte inclus
      const hasOptIn = dancers.length === 0 || dancers.some(d => {
        const prefs = d.notificationPreferences as Record<string, boolean> | undefined;
        return prefs?.[channelId] !== false;
      });
      if (hasOptIn) recipientCount++;
    }
    return { recipientCount };
  },
);

// ── sendNotification ──────────────────────────────────────────────────────────
export const sendNotification = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Non authentifié');

    const { channelId, title, body } = request.data as {
      channelId: string;
      title: string;
      body: string;
    };
    if (!channelId || !title || !body) {
      throw new HttpsError('invalid-argument', 'channelId, title et body sont requis');
    }

    const db = getDb();

    const channelSnap = await db.doc(`notificationChannels/${channelId}`).get();
    if (!channelSnap.exists) throw new HttpsError('not-found', 'Canal introuvable');
    const channel = channelSnap.data()!;
    if (!channel.isActive) throw new HttpsError('failed-precondition', 'Canal inactif');

    const accountIds = await resolveRecipientAccountIds(db, channel);

    // Préférences opt-out par danseur
    const allDancersSnap = await db.collection('dancers').get();
    const dancersByAccountId = new Map<string, admin.firestore.DocumentData[]>();
    allDancersSnap.docs.forEach(d => {
      const data = d.data();
      const aid = data.accountId as string;
      if (!aid) return;
      if (!dancersByAccountId.has(aid)) dancersByAccountId.set(aid, []);
      dancersByAccountId.get(aid)!.push(data);
    });

    const accountSnaps = await Promise.all(accountIds.map(id => db.doc(`accounts/${id}`).get()));
    const fcmTokens: string[] = [];
    let recipientCount = 0;

    for (const snap of accountSnaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      const dancers = dancersByAccountId.get(snap.id) ?? [];
      // Exclure si tous les danseurs du compte ont opt-out
      const hasOptIn = dancers.length === 0 || dancers.some(d => {
        const prefs = d.notificationPreferences as Record<string, boolean> | undefined;
        return prefs?.[channelId] !== false;
      });
      if (!hasOptIn) continue;
      recipientCount++;
      if (Array.isArray(data.fcmTokens)) fcmTokens.push(...data.fcmTokens);
    }

    let fcmSuccessCount = 0;
    const invalidTokens: string[] = [];

    if (fcmTokens.length > 0) {
      const result = await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens.slice(0, 500),
        notification: { title, body },
        data: { channelId, type: 'announcement' },
      });
      fcmSuccessCount = result.successCount;
      result.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code ?? '';
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(fcmTokens[idx]!);
          }
        }
      });
    }

    await db.collection('notifications').add({
      channelId,
      title,
      body,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentBy: request.auth.uid,
      recipientCount,
      fcmSuccessCount,
    });

    // Nettoyage des tokens invalides
    for (const invalidToken of invalidTokens) {
      const tokenSnap = await db.collection('accounts')
        .where('fcmTokens', 'array-contains', invalidToken)
        .get();
      for (const d of tokenSnap.docs) {
        await d.ref.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(invalidToken),
        });
      }
    }

    return { recipientCount, fcmSuccessCount };
  },
);

// ── onChatMessageCreated — notifie les membres abonnés au canal ───────────────
export const onChatMessageCreated = onDocumentCreated(
  { document: 'chatMessages/{messageId}', region: 'europe-west3' },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    const db = getDb();
    const channelId: string = msg.channelId;
    const authorName: string = msg.authorName;
    const text: string = msg.text ?? (msg.mediaType === 'image' ? '📷 Photo' : msg.mediaType === 'audio' ? '🎵 Audio' : msg.mediaType === 'video' ? '🎬 Vidéo' : 'Nouveau message');

    // Récupère tous les accounts avec un FCM token
    const accountsSnap = await db.collection('accounts').where('fcmTokens', '!=', []).get();

    const tokens: string[] = [];
    for (const accDoc of accountsSnap.docs) {
      const accData = accDoc.data();
      const fcmTokens: string[] = accData.fcmTokens ?? [];
      if (fcmTokens.length === 0) continue;

      // Vérifie l'opt-out : au moins un danseur du compte n'a pas désactivé ce canal
      const dancersSnap = await db.collection('dancers')
        .where('accountId', '==', accDoc.id).get();

      const hasOptIn = dancersSnap.docs.some(d => {
        const prefs = d.data().notificationPreferences ?? {};
        return prefs[`chat_${channelId}`] !== false;
      });

      if (hasOptIn) tokens.push(...fcmTokens);
    }

    if (tokens.length === 0) return;

    // Envoie FCM par lots de 500
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));
    for (const chunk of chunks) {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title: authorName, body: text },
        data: { type: 'chat', channelId },
        webpush: { fcmOptions: { link: `/chat/${channelId}` } },
      });
      // Nettoie les tokens invalides
      const invalidTokens: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && (r.error?.code === 'messaging/invalid-registration-token' ||
          r.error?.code === 'messaging/registration-token-not-registered')) {
          invalidTokens.push(chunk[i]!);
        }
      });
      if (invalidTokens.length > 0) {
        const batch = db.batch();
        accountsSnap.docs.forEach(d => {
          const toRemove = invalidTokens.filter(t => (d.data().fcmTokens ?? []).includes(t));
          if (toRemove.length > 0) {
            batch.update(d.ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...toRemove) });
          }
        });
        await batch.commit();
      }
    }
  },
);

// ── generateReceipt — logique partagée de génération de reçu PDF ─────────────
async function generateReceipt(installmentId: string, data: admin.firestore.DocumentData) {
    const db = getDb();
    const bucket = admin.storage().bucket();

    const userId: string = data.userId;
    const amountCents: number = data.amount ?? 0;

    // Récupère les infos
    const [accountSnap, dancersSnap] = await Promise.all([
      db.doc(`accounts/${userId}`).get(),
      db.collection('dancers').where('accountId', '==', userId).where('isActive', '==', true).limit(1).get(),
    ]);

    const accountData = accountSnap.data() ?? {};
    const dancerData = dancersSnap.docs[0]?.data() ?? {};
    const memberName = dancerData.firstName && dancerData.lastName
      ? `${dancerData.firstName} ${dancerData.lastName}`
      : (accountData.displayName ?? accountData.email ?? 'Membre');

    // Saison
    let seasonLabel = '';
    const membershipId: string | undefined = data.membershipId;
    if (membershipId) {
      const memberSnap = await db.doc(`memberships/${membershipId}`).get();
      if (memberSnap.exists) {
        const seasonSnap = await db.doc(`seasons/${memberSnap.data()!.seasonId}`).get();
        seasonLabel = (seasonSnap.data()?.label as string | undefined) ?? '';
      }
    }

    // Numéro de reçu unique
    const counterRef = db.doc('config/receiptCounter');
    const year = new Date().getFullYear();
    const receiptNumber = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const stored = snap.exists ? (snap.data() ?? {}) : {};
      const storedYear: number = (stored.year as number) ?? 0;
      const last: number = storedYear === year ? ((stored.last as number) ?? 0) : 0;
      const next = last + 1;
      tx.set(counterRef, { last: next, year }, { merge: false });
      return `${year}-${String(next).padStart(4, '0')}`;
    });

    // Génère le PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const blue = rgb(0.1, 0.22, 0.42);
    const gray = rgb(0.45, 0.45, 0.45);
    const black = rgb(0, 0, 0);

    // En-tête
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: blue });
    page.drawText('Club de Danse Voiron', {
      x: 40, y: height - 38, size: 20, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText('Reçu de paiement', {
      x: 40, y: height - 60, size: 11, font: fontReg, color: rgb(0.85, 0.85, 0.95),
    });

    // Numéro + date
    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    page.drawText(`N° ${receiptNumber}`, {
      x: width - 200, y: height - 38, size: 13, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText(dateStr, {
      x: width - 200, y: height - 58, size: 10, font: fontReg, color: rgb(0.85, 0.85, 0.95),
    });

    // Corps
    let y = height - 130;
    const drawRow = (label: string, value: string, bold = false) => {
      page.drawText(label, { x: 60, y, size: 11, font: fontReg, color: gray });
      page.drawText(value, { x: 220, y, size: 11, font: bold ? fontBold : fontReg, color: black });
      y -= 26;
    };

    page.drawText('Détails du paiement', {
      x: 60, y, size: 14, font: fontBold, color: blue,
    });
    y -= 34;

    // Ligne séparatrice
    page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
    y -= 22;

    drawRow('Adhérent', memberName);
    if (seasonLabel) drawRow('Saison', seasonLabel);
    drawRow('Méthode de paiement', data.method === 'cheque' ? 'Chèque' : data.method === 'transfer' ? 'Virement' : data.method === 'cash' ? 'Espèces' : data.method ?? '');
    if (data.expectedDate) drawRow('Date d\'échéance', data.expectedDate);
    drawRow('Date de paiement', new Date().toLocaleDateString('fr-FR'));

    y -= 10;
    page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
    y -= 30;

    // Montant total encadré
    const amountStr = `${(amountCents / 100).toFixed(2).replace('.', ',')} €`;
    page.drawRectangle({ x: 60, y: y - 10, width: width - 120, height: 44, color: rgb(0.96, 0.97, 1) });
    page.drawText('Montant payé', { x: 80, y: y + 10, size: 12, font: fontReg, color: gray });
    page.drawText(amountStr, { x: width - 160, y: y + 10, size: 18, font: fontBold, color: blue });
    y -= 60;

    // Pied de page
    page.drawText('Ce document constitue un reçu officiel de paiement.', {
      x: 60, y: 60, size: 9, font: fontReg, color: gray,
    });
    page.drawText('Club de Danse Voiron — CDV', {
      x: 60, y: 44, size: 9, font: fontReg, color: gray,
    });

    const pdfBytes = await pdfDoc.save();

    // Upload Storage
    const fileName = `recu-${receiptNumber}.pdf`;
    const storagePath = `documents/${userId}/receipts/${fileName}`;
    const tempPath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempPath, pdfBytes);

    const downloadToken = crypto.randomUUID();
    await bucket.upload(tempPath, {
      destination: storagePath,
      metadata: {
        contentType: 'application/pdf',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
    fs.unlinkSync(tempPath);

    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // Crée le doc Firestore
    await db.collection('documents').add({
      userId,
      dancerId: dancersSnap.docs[0]?.id ?? null,
      type: 'receipt',
      fileUrl,
      fileName,
      relatedId: installmentId,
      receiptNumber,
      amount: amountCents,
      memberName,
      seasonLabel: seasonLabel || null,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[generateReceipt] Reçu ${receiptNumber} généré pour ${userId} — ${amountStr}`);
}

// ── onInstallmentPaid — trigger sur mise à jour (pending → paid) ──────────────
export const onInstallmentPaid = onDocumentUpdated(
  { document: 'paymentInstallments/{installmentId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === 'paid' || after.status !== 'paid') return;
    await generateReceipt(event.params.installmentId, after);
  },
);

// ── onInstallmentCreatedPaid — trigger sur création directe avec status paid ──
export const onInstallmentCreatedPaid = onDocumentCreated(
  { document: 'paymentInstallments/{installmentId}', region: 'europe-west3' },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.status !== 'paid') return;
    await generateReceipt(event.params.installmentId, data);
  },
);

// ── generateMembershipAttestation — appelée en cas d'approbation classique ───
// (transition pending → approved) OU de création directe déjà 'approved'
// (plan créé et approuvé en un clic par l'admin).
async function generateMembershipAttestation(
  membershipId: string,
  after: admin.firestore.DocumentData,
) {
    const db = getDb();
    const bucket = admin.storage().bucket();

    const userId: string = after.userId;
    const seasonId: string = after.seasonId;
    const dancerIdFromMembership: string | null = (after.dancerId as string | undefined) ?? null;

    // Récupère infos en parallèle
    const [accountSnap, seasonSnap, regsSnap, clubSnap] = await Promise.all([
      db.doc(`accounts/${userId}`).get(),
      db.doc(`seasons/${seasonId}`).get(),
      db.collection('registrations').where('userId', '==', userId).where('status', '==', 'active').get(),
      db.doc('clubProfile/main').get(),
    ]);

    // Danseur : utilise dancerId du membership si disponible (cas groupé/famille)
    let dancerData: Record<string, unknown> = {};
    let dancerId: string | null = null;
    if (dancerIdFromMembership) {
      const snap = await db.doc(`dancers/${dancerIdFromMembership}`).get();
      dancerData = snap.data() ?? {};
      dancerId = dancerIdFromMembership;
    } else {
      const snap = await db.collection('dancers')
        .where('accountId', '==', userId)
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (snap.docs[0]) {
        dancerData = snap.docs[0].data();
        dancerId = snap.docs[0].id;
      }
    }

    // Ajoute la saison aux validatedSeasonIds du danseur (pour le trombinoscope)
    if (dancerId && seasonId) {
      await db.doc(`dancers/${dancerId}`).update({
        validatedSeasonIds: admin.firestore.FieldValue.arrayUnion(seasonId),
      });
    }

    const accountData = accountSnap.data() ?? {};
    const memberName = dancerData.firstName && dancerData.lastName
      ? `${dancerData.firstName} ${dancerData.lastName}`
      : (accountData.displayName ?? accountData.email ?? 'Membre');
    const memberNumber: string = dancerData.memberNumber ?? '';
    const seasonLabel: string = (seasonSnap.data()?.label as string | undefined) ?? '';

    const clubData = clubSnap.data() ?? {};
    const clubName: string = (clubData.officialName as string | undefined) ?? 'Club de Danse Voiron';
    const clubSiret: string = (clubData.siret as string | undefined) ?? '';
    const clubApe: string = (clubData.apeCode as string | undefined) ?? '';
    const clubAssocNum: string = (clubData.associationNumber as string | undefined) ?? '';
    const clubLegalStatus: string = (clubData.legalStatus as string | undefined) ?? 'Association loi 1901';
    const clubPresidentName: string = (clubData.presidentName as string | undefined) ?? '';
    const clubPresidentSignatureUrl: string = (clubData.presidentSignatureUrl as string | undefined) ?? '';
    const clubAddr = clubData.headquartersAddress as { street?: string; postalCode?: string; city?: string; country?: string } | undefined;
    const clubAddressLine = clubAddr
      ? [clubAddr.street, `${clubAddr.postalCode ?? ''} ${clubAddr.city ?? ''}`.trim()].filter(Boolean).join(', ')
      : '';

    // Cours inscrits
    const courseIds = regsSnap.docs.map(d => d.data().courseId as string).filter(Boolean);
    let courseNames: string[] = [];
    if (courseIds.length > 0) {
      const courseSnaps = await Promise.all(courseIds.map(id => db.doc(`courses/${id}`).get()));
      courseNames = courseSnaps.filter(s => s.exists).map(s => s.data()!.name as string);
    }

    // Génère le PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const blue = rgb(0.1, 0.22, 0.42);
    const gray = rgb(0.45, 0.45, 0.45);
    const black = rgb(0, 0, 0);

    // En-tête
    page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: blue });
    page.drawText(clubName, {
      x: 40, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1),
    });
    page.drawText('Attestation d\'adhésion — Activité : Danse', {
      x: 40, y: height - 58, size: 10, font: fontReg, color: rgb(0.85, 0.85, 0.95),
    });
    if (clubAddressLine) {
      page.drawText(clubAddressLine, {
        x: 40, y: height - 74, size: 9, font: fontReg, color: rgb(0.75, 0.75, 0.9),
      });
    }

    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    page.drawText(dateStr, {
      x: width - 190, y: height - 49, size: 9, font: fontReg, color: rgb(0.85, 0.85, 0.95),
    });

    // Intro
    let y = height - 140;
    page.drawText(`${clubName} atteste que :`, {
      x: 60, y, size: 11, font: fontReg, color: gray,
    });
    y -= 50;

    // Bloc membre
    page.drawRectangle({ x: 60, y: y - 14, width: width - 120, height: 90, color: rgb(0.96, 0.97, 1) });
    page.drawText(memberName, { x: 80, y: y + 50, size: 18, font: fontBold, color: blue });
    if (memberNumber) {
      page.drawText(`Numéro de membre : ${memberNumber}`, { x: 80, y: y + 26, size: 11, font: fontReg, color: black });
    }
    if (accountData.email) {
      page.drawText(accountData.email as string, { x: 80, y: y + 8, size: 10, font: fontReg, color: gray });
    }
    y -= 60;

    // Détails adhésion
    y -= 30;
    page.drawText('est bien adhérent(e) au club pour la saison :', {
      x: 60, y, size: 11, font: fontReg, color: gray,
    });
    y -= 28;
    page.drawText(seasonLabel, { x: 60, y, size: 14, font: fontBold, color: blue });
    y -= 40;

    // Cours inscrits
    if (courseNames.length > 0) {
      page.drawText('Cours suivis :', { x: 60, y, size: 11, font: fontBold, color: black });
      y -= 22;
      for (const name of courseNames) {
        page.drawText(`• ${name}`, { x: 80, y, size: 11, font: fontReg, color: black });
        y -= 20;
      }
      y -= 10;
    }

    // Montant et mode de règlement
    const totalDue: number = after.totalDue ?? 0;
    const paymentMethod: string = after.paymentMethod ?? '';
    const methodLabel = paymentMethod === 'cheque' ? 'Chèque' : paymentMethod === 'transfer' ? 'Virement bancaire' : paymentMethod === 'cash' ? 'Espèces' : paymentMethod;
    const amountStr = `${(totalDue / 100).toFixed(2).replace('.', ',')} €`;

    page.drawText('Cotisation :', { x: 60, y, size: 11, font: fontBold, color: black });
    page.drawText(amountStr, { x: 180, y, size: 11, font: fontBold, color: blue });
    y -= 22;
    page.drawText('Mode de règlement :', { x: 60, y, size: 11, font: fontBold, color: black });
    page.drawText(methodLabel, { x: 220, y, size: 11, font: fontReg, color: black });
    y -= 10;

    // Ligne séparatrice
    y -= 20;
    page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
    y -= 30;

    // Mention légale
    page.drawText(
      'Cette attestation est délivrée à titre officiel et peut être utilisée',
      { x: 60, y, size: 9, font: fontItalic, color: gray },
    );
    y -= 14;
    page.drawText(
      'pour justifier d\'une adhésion à une association sportive (assurance, URSSAF, etc.).',
      { x: 60, y, size: 9, font: fontItalic, color: gray },
    );

    // Zone signature
    y -= 30;
    const sigZoneX = width - 240;
    const sigZoneY = y - 60;

    // Embed signature image si disponible
    if (clubPresidentSignatureUrl) {
      try {
        const imgResponse = await fetch(clubPresidentSignatureUrl);
        if (imgResponse.ok) {
          const imgBuffer = await imgResponse.arrayBuffer();
          const contentType = imgResponse.headers.get('content-type') ?? '';
          const sigImage = contentType.includes('png')
            ? await pdfDoc.embedPng(imgBuffer)
            : await pdfDoc.embedJpg(imgBuffer);
          const sigDims = sigImage.scaleToFit(160, 60);
          page.drawImage(sigImage, {
            x: sigZoneX,
            y: sigZoneY + 10,
            width: sigDims.width,
            height: sigDims.height,
          });
        }
      } catch (err) {
        console.warn('[onMembershipApproved] Impossible de charger la signature :', err);
      }
    }

    page.drawLine({ start: { x: sigZoneX, y: sigZoneY }, end: { x: width - 60, y: sigZoneY }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
    const presLine = clubPresidentName ? `Le/La Président·e — ${clubPresidentName}` : 'Le Bureau du club';
    page.drawText(presLine, { x: sigZoneX, y: sigZoneY - 14, size: 9, font: fontReg, color: gray });

    // Pied de page avec mentions légales
    const footerParts: string[] = [`${clubName} — ${clubLegalStatus}`];
    if (clubSiret) footerParts.push(`SIRET : ${clubSiret}`);
    if (clubApe) footerParts.push(`APE : ${clubApe}`);
    if (clubAssocNum) footerParts.push(`N° ${clubAssocNum}`);

    page.drawText(footerParts.join('  •  '), {
      x: 40, y: 40, size: 8, font: fontReg, color: gray,
    });

    const pdfBytes = await pdfDoc.save();

    // Upload Storage
    const safeLabel = seasonLabel.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const safeDancer = memberName.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 30);
    const fileName = `attestation-${safeLabel}-${safeDancer}.pdf`;
    const storagePath = `documents/${userId}/attestations/${fileName}`;
    const tempPath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempPath, pdfBytes);

    const downloadToken = crypto.randomUUID();
    await bucket.upload(tempPath, {
      destination: storagePath,
      metadata: {
        contentType: 'application/pdf',
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });
    fs.unlinkSync(tempPath);

    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    // Crée le doc Firestore
    await db.collection('documents').add({
      userId,
      dancerId,
      type: 'attestation',
      fileUrl,
      fileName,
      relatedId: membershipId,
      memberName,
      seasonLabel: seasonLabel || null,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[generateMembershipAttestation] Attestation générée pour ${userId} — saison ${seasonLabel}`);
}

// ── onMembershipApproved — transition pending/rejected → approved ───────────
export const onMembershipApproved = onDocumentUpdated(
  { document: 'memberships/{membershipId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.paymentPlanStatus === 'approved' || after.paymentPlanStatus !== 'approved') return;
    await generateMembershipAttestation(event.params.membershipId, after);
  },
);

// ── onMembershipCreatedApproved — création directe déjà 'approved' ──────────
// (plan créé et approuvé en un clic par l'admin, sans passer par 'pending')
export const onMembershipCreatedApproved = onDocumentCreated(
  { document: 'memberships/{membershipId}', region: 'europe-west3' },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.paymentPlanStatus !== 'approved') return;
    await generateMembershipAttestation(event.params.membershipId, data);
  },
);

// ── generateCancellationCertificate — PDF partagé memberships/paymentGroups ──
async function generateCancellationCertificate(
  id: string,
  after: admin.firestore.DocumentData,
  kind: 'solo' | 'group',
) {
  const db = getDb();
  const bucket = admin.storage().bucket();

  const userId: string = after.userId;
  const seasonId: string = after.seasonId;

  const [accountSnap, seasonSnap, clubSnap] = await Promise.all([
    db.doc(`accounts/${userId}`).get(),
    db.doc(`seasons/${seasonId}`).get(),
    db.doc('clubProfile/main').get(),
  ]);

  let dancerId: string | null = null;
  let memberName = '';

  if (kind === 'solo') {
    dancerId = (after.dancerId as string | undefined) ?? null;
    if (dancerId) {
      const dSnap = await db.doc(`dancers/${dancerId}`).get();
      if (dSnap.exists) {
        const d = dSnap.data()!;
        memberName = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();
      }
    }
  } else {
    const membershipIds: string[] = after.membershipIds ?? [];
    const membershipSnaps = await Promise.all(membershipIds.map((mid: string) => db.doc(`memberships/${mid}`).get()));
    const names: string[] = [];
    for (const ms of membershipSnaps) {
      if (!ms.exists) continue;
      const mDancerId = ms.data()!.dancerId as string | undefined;
      if (mDancerId) {
        const dSnap = await db.doc(`dancers/${mDancerId}`).get();
        if (dSnap.exists) {
          const d = dSnap.data()!;
          names.push(`${d.firstName ?? ''} ${d.lastName ?? ''}`.trim());
        }
      }
    }
    memberName = names.join(' & ');
  }

  const accountData = accountSnap.data() ?? {};
  if (!memberName) memberName = (accountData.displayName as string | undefined) ?? (accountData.email as string | undefined) ?? 'Membre';
  const seasonLabel: string = (seasonSnap.data()?.label as string | undefined) ?? '';

  const clubData = clubSnap.data() ?? {};
  const clubName: string = (clubData.officialName as string | undefined) ?? 'Club de Danse Voiron';
  const clubLegalStatus: string = (clubData.legalStatus as string | undefined) ?? 'Association loi 1901';
  const clubSiret: string = (clubData.siret as string | undefined) ?? '';
  const clubApe: string = (clubData.apeCode as string | undefined) ?? '';
  const clubAssocNum: string = (clubData.associationNumber as string | undefined) ?? '';

  const totalDueInitial: number = (after.totalDue as number) ?? 0;
  const totalPaid: number = (after.totalPaid as number) ?? 0;
  const reason: string = (after.cancellationReason as string | undefined) ?? '';
  const refundAmount: number = (after.refundAmount as number | undefined) ?? 0;
  const refundMethod: string | undefined = after.refundMethod as string | undefined;
  const refundReference: string | undefined = after.refundReference as string | undefined;
  const cancelledAtDate = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const methodLabel = (m?: string) => m === 'cheque' ? 'Chèque' : m === 'transfer' ? 'Virement bancaire' : m === 'cash' ? 'Espèces' : (m ?? '');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const red = rgb(0.55, 0.13, 0.13);
  const gray = rgb(0.45, 0.45, 0.45);
  const black = rgb(0, 0, 0);

  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: red });
  page.drawText(clubName, { x: 40, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Certificat d\'annulation d\'adhésion', { x: 40, y: height - 58, size: 10, font: fontReg, color: rgb(0.95, 0.85, 0.85) });

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(dateStr, { x: width - 190, y: height - 49, size: 9, font: fontReg, color: rgb(0.95, 0.85, 0.85) });

  let y = height - 140;
  page.drawText(`${clubName} certifie l'annulation de l'adhésion de :`, { x: 60, y, size: 11, font: fontReg, color: gray });
  y -= 50;

  page.drawRectangle({ x: 60, y: y - 14, width: width - 120, height: 60, color: rgb(0.98, 0.95, 0.95) });
  page.drawText(memberName, { x: 80, y: y + 20, size: 18, font: fontBold, color: red });
  if (accountData.email) page.drawText(accountData.email as string, { x: 80, y, size: 10, font: fontReg, color: gray });
  y -= 50;

  y -= 20;
  page.drawText('Saison concernée :', { x: 60, y, size: 11, font: fontBold, color: black });
  page.drawText(seasonLabel, { x: 220, y, size: 11, font: fontReg, color: black });
  y -= 22;
  page.drawText('Date d\'annulation :', { x: 60, y, size: 11, font: fontBold, color: black });
  page.drawText(cancelledAtDate, { x: 220, y, size: 11, font: fontReg, color: black });
  y -= 22;

  if (reason) {
    page.drawText('Motif :', { x: 60, y, size: 11, font: fontBold, color: black });
    page.drawText(reason.slice(0, 60), { x: 220, y, size: 11, font: fontReg, color: black });
    y -= 30;
  } else {
    y -= 10;
  }

  page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
  y -= 26;

  page.drawText('Détails financiers', { x: 60, y, size: 12, font: fontBold, color: red });
  y -= 24;

  const drawRow = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: 60, y, size: 11, font: fontReg, color: gray });
    page.drawText(value, { x: 300, y, size: 11, font: bold ? fontBold : fontReg, color: black });
    y -= 24;
  };

  drawRow('Total encaissé avant annulation', `${(totalPaid / 100).toFixed(2).replace('.', ',')} €`, true);
  drawRow('Solde restant annulé', `${(Math.max(0, totalDueInitial - totalPaid) / 100).toFixed(2).replace('.', ',')} €`);

  if (refundAmount > 0) {
    y -= 6;
    page.drawText('Remboursement', { x: 60, y, size: 12, font: fontBold, color: red });
    y -= 24;
    drawRow('Montant remboursé', `${(refundAmount / 100).toFixed(2).replace('.', ',')} €`, true);
    if (refundMethod) drawRow('Mode de remboursement', methodLabel(refundMethod));
    if (refundReference) drawRow('Référence', refundReference);
  } else {
    y -= 10;
    page.drawText('Aucun remboursement effectué.', { x: 60, y, size: 10, font: fontItalic, color: gray });
    y -= 20;
  }

  y -= 20;
  page.drawLine({ start: { x: 60, y }, end: { x: width - 60, y }, thickness: 1, color: rgb(0.88, 0.88, 0.9) });
  y -= 24;
  page.drawText(
    'Ce document atteste de l\'annulation de l\'adhésion et, le cas échéant, du remboursement effectué.',
    { x: 60, y, size: 9, font: fontItalic, color: gray },
  );

  const footerParts: string[] = [`${clubName} — ${clubLegalStatus}`];
  if (clubSiret) footerParts.push(`SIRET : ${clubSiret}`);
  if (clubApe) footerParts.push(`APE : ${clubApe}`);
  if (clubAssocNum) footerParts.push(`N° ${clubAssocNum}`);
  page.drawText(footerParts.join('  •  '), { x: 40, y: 40, size: 8, font: fontReg, color: gray });

  const pdfBytes = await pdfDoc.save();

  const safeLabel = seasonLabel.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const safeName = memberName.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 30);
  const fileName = `annulation-${safeLabel}-${safeName}.pdf`;
  const storagePath = `documents/${userId}/cancellations/${fileName}`;
  const tempPath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(tempPath, pdfBytes);

  const downloadToken = crypto.randomUUID();
  await bucket.upload(tempPath, {
    destination: storagePath,
    metadata: {
      contentType: 'application/pdf',
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  fs.unlinkSync(tempPath);

  const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

  await db.collection('documents').add({
    userId,
    dancerId,
    type: 'cancellation',
    fileUrl,
    fileName,
    relatedId: id,
    memberName,
    seasonLabel: seasonLabel || null,
    refundAmount: refundAmount || null,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[generateCancellationCertificate] Certificat généré pour ${userId} — saison ${seasonLabel}`);
}

// ── onMembershipCancelled — génère un certificat d'annulation (solo) ─────────
export const onMembershipCancelled = onDocumentUpdated(
  { document: 'memberships/{membershipId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.paymentPlanStatus === 'cancelled' || after.paymentPlanStatus !== 'cancelled') return;
    await generateCancellationCertificate(event.params.membershipId, after, 'solo');
  },
);

// ── onPaymentGroupCancelled — génère un certificat d'annulation (groupe) ─────
export const onPaymentGroupCancelled = onDocumentUpdated(
  { document: 'paymentGroups/{groupId}', region: 'europe-west3' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.paymentPlanStatus === 'cancelled' || after.paymentPlanStatus !== 'cancelled') return;
    await generateCancellationCertificate(event.params.groupId, after, 'group');
  },
);

// ── adminCreateAccount — création de compte(s) + danseur(s) par l'admin ─────
// Ne PEUT PAS réutiliser createUserWithEmailAndPassword côté client : cet
// appel bascule la session active du navigateur vers le nouvel utilisateur
// (déconnecterait l'admin appelant). On passe donc par le SDK Admin,
// côté serveur, qui ne touche jamais à la session de l'appelant.

interface AdminCreateDancerInput {
  firstName: string;
  lastName: string;
  role: string;
  birthDate?: string; // yyyy-mm-dd
  gender?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

interface AdminCreateAccountInput {
  email: string;
  password?: string;
  phone?: string;
  dancers: AdminCreateDancerInput[];
}

// Vérifie que l'appelant a accès à au moins une des pages de gestion des
// danseurs ('/admin/dancers', '/admin/dancers/new', '/admin/dancers/import'),
// via appSettings.pagePermissions — chaque route ADMIN_NAV étant une clé de
// permission indépendante dans "Accès pages", on l'accepte si l'une des trois
// est autorisée pour le rôle de l'appelant.
async function callerHasDancersPageAccess(callerUid: string): Promise<boolean> {
  const db = getDb();
  const accountSnap = await db.doc(`accounts/${callerUid}`).get();
  const accountData = accountSnap.data() ?? {};
  const accountRoles: string[] = accountData.roles ?? [];
  const dancerIds: string[] = accountData.dancerIds ?? [];

  const dancerSnaps = await Promise.all(dancerIds.slice(0, 3).map(id => db.doc(`dancers/${id}`).get()));
  const dancerRoles = dancerSnaps.flatMap(s => (s.exists ? (s.data()!.roles as string[] ?? []) : []));
  const roles = [...accountRoles, ...dancerRoles];

  if (roles.includes('admin')) return true;

  const settingsSnap = await db.doc('appSettings/main').get();
  const pagePermissions = (settingsSnap.data()?.pagePermissions ?? {}) as Record<string, string[]>;
  const pages = ['/admin/dancers', '/admin/dancers/new', '/admin/dancers/import'];
  return pages.some(page => {
    const allowed = pagePermissions[page] ?? ['admin'];
    return roles.some(r => allowed.includes(r));
  });
}

export const adminCreateAccount = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Non authentifié');

    const hasAccess = await callerHasDancersPageAccess(request.auth.uid);
    if (!hasAccess) throw new HttpsError('permission-denied', "Vous n'avez pas accès à cette action");

    const { email, password, phone, dancers } = request.data as AdminCreateAccountInput;
    if (!email || !email.includes('@')) throw new HttpsError('invalid-argument', 'Email invalide');
    if (!dancers || dancers.length === 0) throw new HttpsError('invalid-argument', 'Au moins un danseur est requis');
    for (const d of dancers) {
      if (!d.firstName?.trim() || !d.lastName?.trim() || !d.role) {
        throw new HttpsError('invalid-argument', 'Chaque danseur doit avoir un prénom, un nom et un rôle');
      }
    }

    const db = getDb();
    const wasGenerated = !password;
    const finalPassword = password || `${email}${dancers[0]!.lastName.trim()}`;

    let uid: string;
    try {
      const userRecord = await admin.auth().createUser({
        email,
        password: finalPassword,
        displayName: `${dancers[0]!.firstName.trim()} ${dancers[0]!.lastName.trim()}`.trim(),
      });
      uid = userRecord.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Un compte existe déjà avec cet email');
      }
      throw new HttpsError('internal', (err as Error)?.message ?? 'Erreur lors de la création du compte');
    }

    const dancerRefs = dancers.map(() => db.collection('dancers').doc());
    const batch = db.batch();

    batch.set(db.doc(`accounts/${uid}`), {
      uid,
      email,
      displayName: `${dancers[0]!.firstName.trim()} ${dancers[0]!.lastName.trim()}`.trim(),
      isDancerToo: true,
      dancerIds: dancerRefs.map(r => r.id),
      roles: [],
      isActive: true,
      mustChangePassword: true,
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    dancers.forEach((d, i) => {
      batch.set(dancerRefs[i]!, {
        accountId: uid,
        firstName: d.firstName.trim(),
        lastName: d.lastName.trim(),
        firstNameLower: d.firstName.trim().toLowerCase(),
        lastNameLower: d.lastName.trim().toLowerCase(),
        isMinor: false,
        roles: [d.role],
        isActive: true,
        ...(d.birthDate ? { birthDate: new Date(`${d.birthDate}T00:00:00`) } : {}),
        ...(d.gender?.trim() ? { gender: d.gender.trim() } : {}),
        ...(d.street?.trim() ? { street: d.street.trim() } : {}),
        ...(d.postalCode?.trim() ? { postalCode: d.postalCode.trim() } : {}),
        ...(d.city?.trim() ? { city: d.city.trim() } : {}),
        ...(d.emergencyContactName?.trim() || d.emergencyContactPhone?.trim()
          ? { emergencyContact: { name: d.emergencyContactName?.trim() ?? '', phone: d.emergencyContactPhone?.trim() ?? '' } }
          : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return {
      uid,
      dancerIds: dancerRefs.map(r => r.id),
      generatedPassword: wasGenerated ? finalPassword : null,
    };
  },
);

export const createWebViewAuthToken = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const customToken = await admin.auth().createCustomToken(request.auth.uid);
    return { token: customToken };
  },
);

// ── Intégration Google (contacts + envoi d'emails) ──────────────────────────

const googleOAuthClientId = '959510245510-0av0cahoc0n0jk4622accc5o90md0h8d.apps.googleusercontent.com';
const googleOAuthClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const GOOGLE_OAUTH_REDIRECT_URI = 'https://europe-west3-clubvoiron-dev.cloudfunctions.net/googleOAuthCallback';
const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Vérifie que l'appelant a accès à la page /admin/settings/google-integration,
// via appSettings.pagePermissions (même logique que callerHasDancersPageAccess).
async function callerHasGoogleSettingsAccess(callerUid: string): Promise<boolean> {
  const db = getDb();
  const accountSnap = await db.doc(`accounts/${callerUid}`).get();
  const accountData = accountSnap.data() ?? {};
  const accountRoles: string[] = accountData.roles ?? [];
  const dancerIds: string[] = accountData.dancerIds ?? [];

  const dancerSnaps = await Promise.all(dancerIds.slice(0, 3).map(id => db.doc(`dancers/${id}`).get()));
  const dancerRoles = dancerSnaps.flatMap(s => (s.exists ? (s.data()!.roles as string[] ?? []) : []));
  const roles = [...accountRoles, ...dancerRoles];

  if (roles.includes('admin')) return true;

  const settingsSnap = await db.doc('appSettings/main').get();
  const pagePermissions = (settingsSnap.data()?.pagePermissions ?? {}) as Record<string, string[]>;
  const allowed = pagePermissions['/admin/settings/google-integration'] ?? ['admin'];
  return roles.some(r => allowed.includes(r));
}

function getGoogleOAuthClient(clientSecret: string) {
  return new google.auth.OAuth2(googleOAuthClientId, clientSecret, GOOGLE_OAUTH_REDIRECT_URI);
}

export const getGoogleAuthUrl = onCall(
  { region: 'europe-west3', secrets: [googleOAuthClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const hasAccess = await callerHasGoogleSettingsAccess(request.auth.uid);
    if (!hasAccess) throw new HttpsError('permission-denied', "Vous n'avez pas accès à cette action");

    const oauth2Client = getGoogleOAuthClient(googleOAuthClientSecret.value());
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force le renvoi d'un refresh_token même en cas de reconnexion
      scope: GOOGLE_OAUTH_SCOPES,
    });
    return { url };
  },
);

export const googleOAuthCallback = onRequest(
  { region: 'europe-west3', secrets: [googleOAuthClientSecret] },
  async (req, res) => {
    const code = req.query.code as string | undefined;
    const REDIRECT_SUCCESS = 'https://espace-perso.clubdedanse.net/admin/settings/google-integration?connected=1';
    const REDIRECT_ERROR = 'https://espace-perso.clubdedanse.net/admin/settings/google-integration?connected=0';

    if (!code) { res.redirect(REDIRECT_ERROR); return; }

    try {
      const oauth2Client = getGoogleOAuthClient(googleOAuthClientSecret.value());
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      const db = getDb();
      await db.doc('googleTokens/main').set({
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiryDate: tokens.expiry_date ?? null,
      }, { merge: true });

      await db.doc('appSettings/googleIntegration').set({
        connected: true,
        connectedEmail: userInfo.email ?? null,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      res.redirect(REDIRECT_SUCCESS);
    } catch (err) {
      console.error('googleOAuthCallback failed:', err);
      res.redirect(REDIRECT_ERROR);
    }
  },
);

export const disconnectGoogleAccount = onCall(
  { region: 'europe-west3' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const hasAccess = await callerHasGoogleSettingsAccess(request.auth.uid);
    if (!hasAccess) throw new HttpsError('permission-denied', "Vous n'avez pas accès à cette action");

    const db = getDb();
    await db.doc('googleTokens/main').delete();
    await db.doc('appSettings/googleIntegration').set({
      connected: false,
      connectedEmail: null,
    }, { merge: true });
    return { ok: true };
  },
);

// ── Synchronisation contacts Google (Phase 2 : groupe global uniquement) ────

async function getGoogleAccessToken(clientSecret: string): Promise<string | null> {
  const db = getDb();
  const tokenSnap = await db.doc('googleTokens/main').get();
  if (!tokenSnap.exists) return null;
  const data = tokenSnap.data()!;
  if (!data.refreshToken) return null;

  const oauth2Client = getGoogleOAuthClient(clientSecret);
  oauth2Client.setCredentials({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expiry_date: data.expiryDate,
  });

  // Rafraîchit si le token expire dans moins de 5 minutes.
  const expiresSoon = !data.expiryDate || data.expiryDate < Date.now() + 5 * 60 * 1000;
  if (expiresSoon) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await db.doc('googleTokens/main').set({
        accessToken: credentials.access_token ?? null,
        expiryDate: credentials.expiry_date ?? null,
      }, { merge: true });
      return credentials.access_token ?? null;
    } catch (err) {
      console.error('getGoogleAccessToken refresh failed:', err);
      await db.doc('appSettings/googleIntegration').set({
        lastSyncError: 'Le rafraîchissement du token a échoué, reconnecte le compte Google.',
      }, { merge: true });
      return null;
    }
  }
  return data.accessToken ?? null;
}

async function removeGoogleContact(resourceName: string, clientSecret: string): Promise<void> {
  const accessToken = await getGoogleAccessToken(clientSecret);
  if (!accessToken) return;
  const oauth2Client = getGoogleOAuthClient(clientSecret);
  oauth2Client.setCredentials({ access_token: accessToken });
  const peopleClient = google.people({ version: 'v1', auth: oauth2Client });
  try {
    await peopleClient.people.deleteContact({ resourceName });
  } catch (err) {
    console.error(`removeGoogleContact failed for ${resourceName}:`, err);
  }
}

async function getOrCreateContactGroup(
  peopleClient: ReturnType<typeof google.people>,
  groupName: string,
  cache: Map<string, string>,
): Promise<string> {
  if (cache.has(groupName)) return cache.get(groupName)!;

  const listRes = await peopleClient.contactGroups.list({ pageSize: 200 });
  const existing = (listRes.data.contactGroups ?? []).find(g => g.name === groupName);
  if (existing?.resourceName) {
    cache.set(groupName, existing.resourceName);
    return existing.resourceName;
  }

  const createRes = await peopleClient.contactGroups.create({
    requestBody: { contactGroup: { name: groupName } },
  });
  const resourceName = createRes.data.resourceName!;
  cache.set(groupName, resourceName);
  return resourceName;
}

// Détermine la saison la plus récente (par startDate) parmi les saisons
// validées du danseur — c'est la seule dont le groupe de contacts sera
// conservé, les groupes des saisons plus anciennes sont retirés.
function resolveMostRecentSeason(
  validatedSeasonIds: string[] | undefined,
  seasonsById: Map<string, { label: string; startDateMs: number }>,
): { label: string } | null {
  if (!validatedSeasonIds || validatedSeasonIds.length === 0) return null;
  let best: { label: string; startDateMs: number } | null = null;
  for (const id of validatedSeasonIds) {
    const season = seasonsById.get(id);
    if (!season) continue;
    if (!best || season.startDateMs > best.startDateMs) best = season;
  }
  return best;
}

async function syncOneDancerToGoogle(
  dancerId: string,
  peopleClient: ReturnType<typeof google.people>,
  groupCache: Map<string, string>,
  groupNameGlobal: string,
  groupNameSeasonTemplate: string,
  groupNameTrial: string,
  seasonsById: Map<string, { label: string; startDateMs: number }>,
  etagByResourceName: Map<string, string>,
): Promise<void> {
  const db = getDb();
  const dancerSnap = await db.doc(`dancers/${dancerId}`).get();
  if (!dancerSnap.exists) return;
  const dancer = dancerSnap.data()!;

  // Danseur ayant demandé à être retiré des listes de diffusion Google —
  // on supprime le contact s'il existe et on ne le recrée pas.
  if (dancer.googleContactOptOut === true) {
    if (dancer.googleContactResourceName) {
      try {
        await peopleClient.people.deleteContact({ resourceName: dancer.googleContactResourceName });
      } catch (err) {
        console.error(`syncOneDancerToGoogle opt-out delete failed for ${dancerId}:`, err);
      }
      await db.doc(`dancers/${dancerId}`).update({
        googleContactResourceName: admin.firestore.FieldValue.delete(),
        googleContactGroupIds: admin.firestore.FieldValue.delete(),
      });
    }
    return;
  }

  const accountSnap = await db.doc(`accounts/${dancer.accountId}`).get();
  const account = accountSnap.data() ?? {};

  const globalGroupResourceName = await getOrCreateContactGroup(peopleClient, groupNameGlobal, groupCache);

  const mostRecentSeason = resolveMostRecentSeason(dancer.validatedSeasonIds, seasonsById);
  const dancerRoles: string[] = dancer.roles ?? [];
  let secondaryGroupResourceName: string | null = null;
  if (mostRecentSeason) {
    secondaryGroupResourceName = await getOrCreateContactGroup(
      peopleClient, groupNameSeasonTemplate.replace('{season}', mostRecentSeason.label), groupCache,
    );
  } else if (dancerRoles.includes('trial')) {
    secondaryGroupResourceName = await getOrCreateContactGroup(peopleClient, groupNameTrial, groupCache);
  }

  const desiredGroupIds = [globalGroupResourceName, ...(secondaryGroupResourceName ? [secondaryGroupResourceName] : [])];

  const names = [{ givenName: dancer.firstName, familyName: dancer.lastName }];
  const emailAddresses = account.email ? [{ value: account.email }] : [];
  const phoneNumbers = dancer.phone ? [{ value: dancer.phone }] : [];
  const addresses = (dancer.street || dancer.postalCode || dancer.city) ? [{
    streetAddress: dancer.street ?? '',
    postalCode: dancer.postalCode ?? '',
    city: dancer.city ?? '',
    country: 'France',
  }] : [];
  const birthDateJs: Date | undefined = dancer.birthDate?.toDate?.();
  const birthdays = birthDateJs ? [{
    date: { year: birthDateJs.getFullYear(), month: birthDateJs.getMonth() + 1, day: birthDateJs.getDate() },
  }] : [];

  if (dancer.googleContactResourceName) {
    try {
      const etag = etagByResourceName.get(dancer.googleContactResourceName);
      if (!etag) throw new Error('etag introuvable (contact absent du batchGet)');

      await peopleClient.people.updateContact({
        resourceName: dancer.googleContactResourceName,
        updatePersonFields: 'names,emailAddresses,phoneNumbers,addresses,birthdays',
        requestBody: { etag, names, emailAddresses, phoneNumbers, addresses, birthdays },
      });

      const previousGroupIds: string[] = dancer.googleContactGroupIds ?? [];
      const toAdd = desiredGroupIds.filter(id => !previousGroupIds.includes(id));
      const toRemove = previousGroupIds.filter(id => !desiredGroupIds.includes(id));
      await Promise.all([
        ...toAdd.map(groupResourceName => peopleClient.contactGroups.members.modify({
          resourceName: groupResourceName,
          requestBody: { resourceNamesToAdd: [dancer.googleContactResourceName] },
        })),
        ...toRemove.map(groupResourceName => peopleClient.contactGroups.members.modify({
          resourceName: groupResourceName,
          requestBody: { resourceNamesToRemove: [dancer.googleContactResourceName] },
        })),
      ]);

      await db.doc(`dancers/${dancerId}`).update({ googleContactGroupIds: desiredGroupIds });
      return;
    } catch (err) {
      console.error(`syncOneDancerToGoogle update failed for ${dancerId}, recreating:`, err);
      // Le contact a peut-être été supprimé côté Google — on retombe sur une création.
    }
  }

  const memberships = desiredGroupIds.map(contactGroupResourceName => ({ contactGroupMembership: { contactGroupResourceName } }));
  const createRes = await peopleClient.people.createContact({
    requestBody: { names, emailAddresses, phoneNumbers, addresses, birthdays, memberships },
  });

  await db.doc(`dancers/${dancerId}`).update({
    googleContactResourceName: createRes.data.resourceName,
    googleContactGroupIds: desiredGroupIds,
  });
}

async function runGoogleContactsSync(dancerIds: string[]): Promise<{ synced: number; errors: number }> {
  const db = getDb();
  const settingsSnap = await db.doc('appSettings/googleIntegration').get();
  const settings = settingsSnap.data() ?? {};
  if (!settings.connected) return { synced: 0, errors: 0 };

  const accessToken = await getGoogleAccessToken(googleOAuthClientSecret.value());
  if (!accessToken) return { synced: 0, errors: dancerIds.length };

  const oauth2Client = getGoogleOAuthClient(googleOAuthClientSecret.value());
  oauth2Client.setCredentials({ access_token: accessToken });
  const peopleClient = google.people({ version: 'v1', auth: oauth2Client });

  const groupNameGlobal: string = settings.groupNameGlobal ?? DEFAULT_GOOGLE_GROUP_GLOBAL;
  const groupNameSeasonTemplate: string = settings.groupNameSeasonTemplate ?? DEFAULT_GOOGLE_GROUP_SEASON_TEMPLATE;
  const groupNameTrial: string = settings.groupNameTrial ?? DEFAULT_GOOGLE_GROUP_TRIAL;
  const groupCache = new Map<string, string>();

  const seasonsSnap = await db.collection('seasons').get();
  const seasonsById = new Map<string, { label: string; startDateMs: number }>();
  for (const doc of seasonsSnap.docs) {
    const data = doc.data();
    seasonsById.set(doc.id, {
      label: data.label,
      startDateMs: data.startDate?.toMillis?.() ?? 0,
    });
  }

  // Batch de lecture des etags (contacts existants) : la People API limite
  // strictement les lectures individuelles ("critical read") par minute,
  // un getBatchGet (jusqu'à 200 resourceNames) compte comme une seule lecture.
  const dancerSnaps = await Promise.all(dancerIds.map(id => db.doc(`dancers/${id}`).get()));
  const existingResourceNames = dancerSnaps
    .map(s => s.data()?.googleContactResourceName as string | undefined)
    .filter((r): r is string => !!r);
  const etagByResourceName = new Map<string, string>();
  for (let i = 0; i < existingResourceNames.length; i += 200) {
    const chunk = existingResourceNames.slice(i, i + 200);
    const res = await peopleClient.people.getBatchGet({ resourceNames: chunk, personFields: 'metadata' });
    for (const r of res.data.responses ?? []) {
      if (r.requestedResourceName && r.person?.etag) etagByResourceName.set(r.requestedResourceName, r.person.etag);
    }
  }

  let synced = 0, errors = 0;
  for (const dancerId of dancerIds) {
    try {
      await syncOneDancerToGoogle(dancerId, peopleClient, groupCache, groupNameGlobal, groupNameSeasonTemplate, groupNameTrial, seasonsById, etagByResourceName);
      synced++;
    } catch (err) {
      console.error(`runGoogleContactsSync failed for dancer ${dancerId}:`, err);
      errors++;
    }
  }

  await db.doc('appSettings/googleIntegration').set({
    lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSyncError: errors > 0 ? `${errors} erreur(s) lors de la dernière synchronisation` : null,
  }, { merge: true });

  return { synced, errors };
}

const DEFAULT_GOOGLE_GROUP_GLOBAL = 'Tous les danseurs';
const DEFAULT_GOOGLE_GROUP_SEASON_TEMPLATE = 'Danseurs {season}';
const DEFAULT_GOOGLE_GROUP_TRIAL = 'Essais';

export const syncDancerGoogleContact = onDocumentWritten(
  { document: 'dancers/{dancerId}', region: 'europe-west3', secrets: [googleOAuthClientSecret] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const dancerId = event.params.dancerId;

    const settingsSnap = await getDb().doc('appSettings/googleIntegration').get();
    const settings = settingsSnap.data() ?? {};
    if (!settings.connected || !settings.autoSyncEnabled) return;

    // Suppression franche du danseur, ou anonymisation suite à une demande
    // de suppression de compte (isDeleted) : on retire le contact Google.
    const wasDeleted = !after || (after.isDeleted === true && before?.isDeleted !== true);
    if (wasDeleted) {
      const resourceName = before?.googleContactResourceName as string | undefined;
      if (resourceName) {
        await removeGoogleContact(resourceName, googleOAuthClientSecret.value());
        if (after) {
          await getDb().doc(`dancers/${dancerId}`).update({
            googleContactResourceName: admin.firestore.FieldValue.delete(),
            googleContactGroupIds: admin.firestore.FieldValue.delete(),
          });
        }
      }
      return;
    }
    if (!after) return;

    await runGoogleContactsSync([dancerId]);
  },
);

export const resyncAllGoogleContacts = onCall(
  { region: 'europe-west3', secrets: [googleOAuthClientSecret], timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const hasAccess = await callerHasGoogleSettingsAccess(request.auth.uid);
    if (!hasAccess) throw new HttpsError('permission-denied', "Vous n'avez pas accès à cette action");

    const db = getDb();
    const dancersSnap = await db.collection('dancers').get();
    const dancerIds = dancersSnap.docs.filter(d => d.data().isDeleted !== true).map(d => d.id);

    const result = await runGoogleContactsSync(dancerIds);
    return result;
  },
);

// ── Envoi d'emails via Gmail (Phase 4) ────────────────────────────────────

async function callerHasEmailsPageAccess(callerUid: string): Promise<boolean> {
  const db = getDb();
  const accountSnap = await db.doc(`accounts/${callerUid}`).get();
  const accountData = accountSnap.data() ?? {};
  const accountRoles: string[] = accountData.roles ?? [];
  const dancerIds: string[] = accountData.dancerIds ?? [];

  const dancerSnaps = await Promise.all(dancerIds.slice(0, 3).map(id => db.doc(`dancers/${id}`).get()));
  const dancerRoles = dancerSnaps.flatMap(s => (s.exists ? (s.data()!.roles as string[] ?? []) : []));
  const roles = [...accountRoles, ...dancerRoles];

  if (roles.includes('admin')) return true;

  const settingsSnap = await db.doc('appSettings/main').get();
  const pagePermissions = (settingsSnap.data()?.pagePermissions ?? {}) as Record<string, string[]>;
  const allowed = pagePermissions['/admin/emails'] ?? ['admin'];
  return roles.some(r => allowed.includes(r));
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const sendClubEmail = onCall(
  { region: 'europe-west3', secrets: [googleOAuthClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise');
    const hasAccess = await callerHasEmailsPageAccess(request.auth.uid);
    if (!hasAccess) throw new HttpsError('permission-denied', "Vous n'avez pas accès à cette action");

    const { subject, body, recipientEmails } = request.data as {
      subject: string; body: string; recipientEmails: string[];
    };
    if (!subject?.trim()) throw new HttpsError('invalid-argument', 'Sujet requis');
    if (!body?.trim()) throw new HttpsError('invalid-argument', 'Message requis');
    const cleanRecipients = [...new Set((recipientEmails ?? []).filter(e => e?.includes('@')))];
    if (cleanRecipients.length === 0) throw new HttpsError('invalid-argument', 'Aucun destinataire valide');

    const db = getDb();
    const settingsSnap = await db.doc('appSettings/googleIntegration').get();
    const settings = settingsSnap.data() ?? {};
    if (!settings.connected) throw new HttpsError('failed-precondition', 'Aucun compte Google connecté');

    const accessToken = await getGoogleAccessToken(googleOAuthClientSecret.value());
    if (!accessToken) throw new HttpsError('failed-precondition', 'Impossible de récupérer un token Google valide, reconnecte le compte');

    const oauth2Client = getGoogleOAuthClient(googleOAuthClientSecret.value());
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });

    const senderName: string = settings.senderDisplayName || 'Club de Danse Voiron / Coublevie';
    const fromAddress: string = settings.connectedEmail;
    const replyTo: string | undefined = settings.defaultReplyTo || undefined;

    // Bcc pour que les destinataires ne voient pas les adresses des autres.
    const headers = [
      `From: "${senderName}" <${fromAddress}>`,
      `To: <${fromAddress}>`,
      `Bcc: ${cleanRecipients.join(', ')}`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
    ].filter(Boolean).join('\r\n');

    const htmlBody = escapeHtml(body).replace(/\n/g, '<br>');
    const raw = base64UrlEncode(`${headers}\r\n\r\n${htmlBody}`);

    await gmailClient.users.messages.send({ userId: 'me', requestBody: { raw } });

    return { sent: cleanRecipients.length };
  },
);
