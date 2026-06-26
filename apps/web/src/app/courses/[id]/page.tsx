'use client';

import { useState, useEffect } from 'react';
import {
  doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy, limit,
  runTransaction, serverTimestamp, arrayUnion, increment, documentId,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Course {
  id: string; name: string; danceStyleId: string; levelId: string;
  roomId: string; seasonId: string; dayOfWeek: number;
  startTime: string; endTime: string; instructorId?: string;
  maxParticipants?: number; isActive: boolean;
  activeRegistrationCount?: number;
}
interface Session { id: string; date: string; startTime: string; endTime: string; status: string; }
interface Registrant { id: string; userId: string; displayName: string; email: string; phone?: string; status: 'active' | 'waitlist'; registeredAt: string; photoUrl?: string; }

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CourseDetailPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const sessionDate = searchParams.get('date') ?? null;
  const { user, account } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [styleName, setStyleName] = useState('');
  const [styleColor, setStyleColor] = useState('#6B7280');
  const [levelName, setLevelName] = useState('');
  const [courseLevelOrder, setCourseLevelOrder] = useState<number | null>(null);
  const [roomName, setRoomName] = useState('');
  const [seasonLabel, setSeasonLabel] = useState('');
  const [seasonRegistrationOpen, setSeasonRegistrationOpen] = useState(false);
  const [instructorName, setInstructorName] = useState('');
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerWarning, setRegisterWarning] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [myRegisteredAt, setMyRegisteredAt] = useState<string | null>(null);


  const [registrants, setRegistrants] = useState<Registrant[] | null>(null);
  const [loadingRegistrants, setLoadingRegistrants] = useState(false);
  const [showRegistrants, setShowRegistrants] = useState(false);
  const [registrantCount, setRegistrantCount] = useState<number | null>(null);

  const isRegistered = account?.registeredCourseIds?.includes(courseId) ?? false;

  const isAdmin = account?.roles?.includes('admin') ?? false;

  useEffect(() => {
    if (!user || !isRegistered) return;
    getDocs(query(
      collection(db, 'registrations'),
      where('userId', '==', user.uid),
      where('courseId', '==', courseId),
      where('status', 'in', ['active', 'waitlist']),
    )).then(snap => {
      if (!snap.empty) setMyRegisteredAt(snap.docs[0].data().registeredAt as string);
    });
  }, [user, isRegistered, courseId]);

  useEffect(() => {
    const load = async () => {
      const courseSnap = await getDoc(doc(db, 'courses', courseId));
      if (!courseSnap.exists()) { setLoading(false); return; }
      const c = { id: courseSnap.id, ...courseSnap.data() } as Course;
      setCourse(c);

      const now = new Date();
      const today = toDateStr(now);

      const [styleSnap, levelSnap, roomSnap, seasonSnap, sessionsSnap] = await Promise.all([
        getDoc(doc(db, 'danceStyles', c.danceStyleId)),
        getDoc(doc(db, 'levels', c.levelId)),
        getDoc(doc(db, 'rooms', c.roomId)),
        getDoc(doc(db, 'seasons', c.seasonId)),
        getDocs(query(collection(db, 'sessions'), where('courseId', '==', courseId), where('date', '>=', today), orderBy('date'), limit(10))),
      ]);

      if (styleSnap.exists()) { setStyleName(styleSnap.data().name); setStyleColor(styleSnap.data().color ?? '#6B7280'); }
      if (levelSnap.exists()) { setLevelName(levelSnap.data().name); setCourseLevelOrder(levelSnap.data().order); }
      if (roomSnap.exists()) setRoomName(roomSnap.data().name);
      if (seasonSnap.exists()) {
        setSeasonLabel(seasonSnap.data().label);
        setSeasonRegistrationOpen(seasonSnap.data().registrationOpen ?? false);
      }
      setActiveCount(c.activeRegistrationCount ?? 0);

      try {
        if (c.instructorId) {
          const instrSnap = await getDoc(doc(db, 'dancers', c.instructorId));
          if (instrSnap.exists()) setInstructorName(`${instrSnap.data().firstName} ${instrSnap.data().lastName}`);
        }
      } catch { /* non accessible sans auth */ }

      setUpcomingSessions(
        sessionsSnap.docs
          .filter(d => d.data().status === 'scheduled')
          .slice(0, 5)
          .map(d => ({ id: d.id, date: d.data().date, startTime: d.data().startTime, endTime: d.data().endTime, status: d.data().status }))
      );
      setLoading(false);
    };
    load();
  }, [courseId]);

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(query(
      collection(db, 'registrations'),
      where('courseId', '==', courseId),
      where('status', 'in', ['active', 'waitlist']),
    )).then(snap => {
      const count = sessionDate
        ? snap.docs.filter(d => d.data().registeredAt <= sessionDate).length
        : snap.docs.length;
      setRegistrantCount(count);
    });
  }, [courseId, sessionDate, isAdmin]);

  const isFull = course?.maxParticipants ? activeCount >= course.maxParticipants : false;

  const userLevelIds: string[] = (() => {
    if (!course) return [];
    const raw = account?.levelsByStyle?.[course.danceStyleId];
    return Array.isArray(raw) ? raw : (raw ? [raw] : []);
  })();
  const hasNoDeclaredLevel = !!user && account !== null && userLevelIds.length === 0;

  const handleRegister = async () => {
    if (!user || !course) return;
    setRegistering(true); setRegisterError(null); setRegisterWarning(null);

    try {
      let warning: string | null = null;

      // Vérification niveau côté client (avant transaction)
      if (userLevelIds.length === 0) {
        setRegisterError('Vous devez déclarer votre niveau pour ce style de danse avant de vous inscrire.');
        setRegistering(false); return;
      }
      if (courseLevelOrder !== null) {
        const snaps = await Promise.all(userLevelIds.map(id => getDoc(doc(db, 'levels', id))));
        const maxOrder = Math.max(...snaps.filter(s => s.exists()).map(s => s.data()!.order as number));
        if (maxOrder < courseLevelOrder) {
          setRegisterError('Votre niveau déclaré est insuffisant pour ce cours.');
          setRegistering(false); return;
        }
      }

      const courseRef = doc(db, 'courses', courseId);
      const accountRef = doc(db, 'accounts', user.uid);
      let finalStatus: 'active' | 'waitlist' = 'active';

      await runTransaction(db, async (tx) => {
        const [seasonSnap, courseSnap, accountSnap] = await Promise.all([
          tx.get(doc(db, 'seasons', course.seasonId)),
          tx.get(courseRef),
          tx.get(accountRef),
        ]);

        if (!seasonSnap.exists() || !seasonSnap.data().registrationOpen) {
          throw new Error('Les inscriptions ne sont pas ouvertes pour cette saison.');
        }

        const registeredIds: string[] = accountSnap.data()?.registeredCourseIds ?? [];
        if (registeredIds.includes(courseId)) throw new Error('Vous êtes déjà inscrit à ce cours.');

        const currentCount: number = courseSnap.data()?.activeRegistrationCount ?? 0;
        const max: number | undefined = courseSnap.data()?.maxParticipants;
        finalStatus = (max && currentCount >= max) ? 'waitlist' : 'active';

        const regRef = doc(collection(db, 'registrations'));
        tx.set(regRef, {
          userId: user.uid,
          courseId,
          seasonId: course.seasonId,
          registeredAt: sessionDate ?? toDateStr(new Date()),
          status: finalStatus,
          createdAt: serverTimestamp(),
        });
        tx.update(accountRef, { registeredCourseIds: arrayUnion(courseId) });
        // Le compteur est mis à jour hors transaction pour éviter tout conflit de règles
      });

      // Incrément du compteur uniquement pour les inscrits actifs
      if (finalStatus === 'active') {
        await updateDoc(courseRef, { activeRegistrationCount: increment(1) });
        setActiveCount(c => c + 1);
      }

      setRegisterSuccess(true);
      if ((finalStatus as 'active' | 'waitlist') === 'waitlist') {
        setRegisterWarning('Le cours est complet. Vous avez été ajouté à la liste d\'attente.');
      } else if (warning) {
        setRegisterWarning(warning);
      }
    } catch (e: unknown) {
      setRegisterError(e instanceof Error ? e.message : String(e));
    }
    setRegistering(false);
  };


  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Chargement…</p>
    </div>
  );

  if (!course) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Cours introuvable.</p>
    </div>
  );

  const spotsLeft = course.maxParticipants ? course.maxParticipants - activeCount : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/planning" className="text-sm text-gray-400 hover:text-gray-700 mb-6 inline-block">← Planning</Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-2" style={{ backgroundColor: styleColor }} />
          <div className="px-6 py-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: styleColor }}>{styleName}</span>
                  {levelName && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{levelName}</span>}
                  {!course.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">Inactif</span>}
                  {isRegistered && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Inscrit</span>}
                  {isFull && !isRegistered && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Complet</span>}
                </div>
              </div>
            </div>

            <dl className="space-y-2 text-sm mb-6">
              {sessionDate && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-28 flex-shrink-0">Séance</dt>
                  <dd className="text-gray-800 font-medium">{formatDate(sessionDate)}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-gray-400 w-28 flex-shrink-0">Jour &amp; heure</dt>
                <dd className="text-gray-800 font-medium">{DAY_LABELS[course.dayOfWeek]} {course.startTime}–{course.endTime}</dd>
              </div>
              {roomName && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-28 flex-shrink-0">Salle</dt>
                  <dd className="text-gray-800">{roomName}</dd>
                </div>
              )}
              {instructorName && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-28 flex-shrink-0">Professeur</dt>
                  <dd className="text-gray-800">{instructorName}</dd>
                </div>
              )}
              {course.maxParticipants && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-28 flex-shrink-0">Places</dt>
                  <dd className={`font-medium ${isFull ? 'text-red-600' : 'text-gray-800'}`}>
                    {activeCount} / {course.maxParticipants}
                    {spotsLeft !== null && spotsLeft > 0 && <span className="text-gray-400 font-normal"> ({spotsLeft} disponible{spotsLeft > 1 ? 's' : ''})</span>}
                  </dd>
                </div>
              )}
              {seasonLabel && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-28 flex-shrink-0">Saison</dt>
                  <dd className="text-gray-800">{seasonLabel}</dd>
                </div>
              )}
            </dl>


            {(registerSuccess || (isRegistered && (!sessionDate || !myRegisteredAt || sessionDate >= myRegisteredAt))) && (
              <div className="bg-green-50 rounded-lg px-3 py-2 space-y-1">
                <p className="text-sm text-green-700 font-medium">
                  {registerSuccess && !isRegistered ? 'Inscription confirmée !' : 'Vous êtes inscrit à ce cours.'}
                </p>
                {registerWarning && <p className="text-xs text-orange-600">{registerWarning}</p>}
                <Link href="/my-courses" className="text-xs text-green-600 underline">Voir mes cours →</Link>
              </div>
            )}

            {!user && (
              <Link href="/login" className="block w-full text-center bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                Se connecter pour s'inscrire
              </Link>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <button
              onClick={async () => {
                if (showRegistrants) { setShowRegistrants(false); return; }
                setShowRegistrants(true);
                if (registrants !== null) return;
                setLoadingRegistrants(true);
                const regsSnap = await getDocs(query(
                  collection(db, 'registrations'),
                  where('courseId', '==', courseId),
                  where('status', 'in', ['active', 'waitlist']),
                ));
                const regs = regsSnap.docs.map(d => ({
                  id: d.id, userId: d.data().userId,
                  status: d.data().status as 'active' | 'waitlist',
                  registeredAt: d.data().registeredAt as string,
                }));
                const userIds = [...new Set(regs.map(r => r.userId))];
                const accountMap = new Map<string, { displayName: string; email: string; phone?: string }>();
                for (let i = 0; i < userIds.length; i += 30) {
                  const batch = userIds.slice(i, i + 30);
                  const accSnap = await getDocs(query(collection(db, 'accounts'), where(documentId(), 'in', batch)));
                  accSnap.docs.forEach(d => accountMap.set(d.id, { displayName: d.data().displayName, email: d.data().email, phone: d.data().phone }));
                }
                // Photos depuis les dancers (accountId == userId)
                const photoMap = new Map<string, string>();
                for (let i = 0; i < userIds.length; i += 30) {
                  const batch = userIds.slice(i, i + 30);
                  const dSnap = await getDocs(query(collection(db, 'dancers'), where('accountId', 'in', batch)));
                  dSnap.docs.forEach(d => {
                    if (d.data().photoUrl && !photoMap.has(d.data().accountId)) {
                      photoMap.set(d.data().accountId, d.data().photoUrl);
                    }
                  });
                }

                const rows: Registrant[] = regs.map(r => ({
                  ...r,
                  displayName: accountMap.get(r.userId)?.displayName ?? r.userId,
                  email: accountMap.get(r.userId)?.email ?? '—',
                  phone: accountMap.get(r.userId)?.phone,
                  photoUrl: photoMap.get(r.userId),
                }));
                rows.sort((a, b) => a.status === b.status ? a.registeredAt.localeCompare(b.registeredAt) : a.status === 'active' ? -1 : 1);
                setRegistrants(sessionDate ? rows.filter(r => r.registeredAt <= sessionDate) : rows);
                setLoadingRegistrants(false);
              }}
              className="flex items-center justify-between w-full bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700">
                {registrantCount !== null
                  ? `${registrantCount} inscrit${registrantCount > 1 ? 's' : ''}`
                  : 'Inscrits'
                }
                {sessionDate && (
                  <span className="ml-2 text-xs font-normal text-gray-400">au {sessionDate}</span>
                )}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 transition-transform ${showRegistrants ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showRegistrants && (
              <div className="mt-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                {loadingRegistrants ? (
                  <p className="text-sm text-gray-400 text-center py-6">Chargement…</p>
                ) : !registrants || registrants.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Aucune inscription.</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {registrants.map(r => (
                      <li key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                              {r.displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{r.displayName}</p>
                            <p className="text-xs text-gray-400 truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {r.status === 'active' ? 'Inscrit' : 'Attente'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                  {registrants && registrants.length > 0 && (
                    <span className="text-xs text-gray-500">
                      <span className="text-green-700 font-medium">{registrants.filter(r => r.status === 'active').length} inscrit{registrants.filter(r => r.status === 'active').length > 1 ? 's' : ''}</span>
                      {registrants.filter(r => r.status === 'waitlist').length > 0 && (
                        <span className="text-orange-600 ml-2">{registrants.filter(r => r.status === 'waitlist').length} en attente</span>
                      )}
                    </span>
                  )}
                  <Link href={`/admin/courses/${courseId}/registrations${sessionDate ? `?refDate=${sessionDate}` : ''}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto">
                    Gérer les inscriptions →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {upcomingSessions.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Prochaines séances</h2>
            <div className="space-y-2">
              {upcomingSessions.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3">
                  <span className="text-sm font-medium text-gray-800">{formatDate(s.date)}</span>
                  <span className="text-sm text-gray-400 ml-2">{s.startTime}–{s.endTime}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
