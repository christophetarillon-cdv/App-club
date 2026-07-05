'use client';

import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy, query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface DanceStyle { id: string; name: string; color: string; }
interface Level { id: string; name: string; order: number; }
interface Room { id: string; name: string; }
interface Season { id: string; label: string; }
interface Instructor { id: string; firstName: string; lastName: string; }

interface Course {
  id: string;
  name: string;
  danceStyleId: string;
  levelId: string;
  roomId: string;
  seasonId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  instructorId?: string;
  maxParticipants?: number;
  isActive: boolean;
  isOneOff?: boolean;
  oneOffDate?: string;
}

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatOneOffDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

const emptyForm = {
  name: '', danceStyleId: '', levelId: '', roomId: '', seasonId: '',
  isOneOff: false, dayOfWeek: '1', oneOffDate: '', startTime: '', endTime: '', instructorId: '',
  maxParticipants: '', isActive: true,
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRefs = async () => {
    const [stylesSnap, levelsSnap, roomsSnap, seasonsSnap, instructorsSnap] = await Promise.all([
      getDocs(query(collection(db, 'danceStyles'), orderBy('name'))),
      getDocs(query(collection(db, 'levels'), orderBy('order'))),
      getDocs(query(collection(db, 'rooms'), orderBy('name'))),
      getDocs(query(collection(db, 'seasons'), orderBy('startDate', 'desc'))),
      getDocs(query(collection(db, 'dancers'), where('roles', 'array-contains-any', ['instructor', 'admin']))),
    ]);
    setDanceStyles(stylesSnap.docs.map(d => ({ id: d.id, name: d.data().name, color: d.data().color })));
    setLevels(levelsSnap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order })));
    setRooms(roomsSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    setSeasons(seasonsSnap.docs.map(d => ({ id: d.id, label: d.data().label })));
    setInstructors(instructorsSnap.docs.map(d => ({ id: d.id, firstName: d.data().firstName, lastName: d.data().lastName })));
  };

  const load = async () => {
    const snap = await getDocs(query(collection(db, 'courses'), orderBy('name')));
    setCourses(snap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      danceStyleId: d.data().danceStyleId,
      levelId: d.data().levelId,
      roomId: d.data().roomId,
      seasonId: d.data().seasonId,
      dayOfWeek: d.data().dayOfWeek,
      startTime: d.data().startTime,
      endTime: d.data().endTime,
      instructorId: d.data().instructorId,
      maxParticipants: d.data().maxParticipants,
      isActive: d.data().isActive ?? true,
      isOneOff: d.data().isOneOff ?? false,
      oneOffDate: d.data().oneOffDate,
    })));
    setLoading(false);
  };

  useEffect(() => { Promise.all([loadRefs(), load()]); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Séance ponctuelle : le jour de la semaine est déduit de la date choisie
    // (uniquement pour l'affichage — la génération de séance ne s'appuie que
    // sur oneOffDate côté Cloud Function).
    const dayOfWeek = form.isOneOff && form.oneOffDate
      ? new Date(form.oneOffDate + 'T00:00:00').getDay()
      : Number(form.dayOfWeek);

    const payload: Record<string, unknown> = {
      name: form.name,
      danceStyleId: form.danceStyleId,
      levelId: form.levelId,
      roomId: form.roomId,
      seasonId: form.seasonId,
      dayOfWeek,
      isOneOff: form.isOneOff,
      startTime: form.startTime,
      endTime: form.endTime,
      isActive: form.isActive,
      updatedAt: serverTimestamp(),
    };
    if (form.isOneOff) payload.oneOffDate = form.oneOffDate;
    if (form.instructorId) payload.instructorId = form.instructorId;
    if (form.maxParticipants !== '') payload.maxParticipants = Number(form.maxParticipants);

    if (editId) {
      await updateDoc(doc(db, 'courses', editId), payload);
    } else {
      await addDoc(collection(db, 'courses'), { ...payload, createdAt: serverTimestamp() });
    }
    setForm(emptyForm); setEditId(null); setSaving(false);
    await load();
  };

  const startEdit = (c: Course) => {
    setForm({
      name: c.name,
      danceStyleId: c.danceStyleId,
      levelId: c.levelId,
      roomId: c.roomId,
      seasonId: c.seasonId,
      isOneOff: c.isOneOff ?? false,
      dayOfWeek: String(c.dayOfWeek),
      oneOffDate: c.oneOffDate ?? '',
      startTime: c.startTime,
      endTime: c.endTime,
      instructorId: c.instructorId ?? '',
      maxParticipants: c.maxParticipants != null ? String(c.maxParticipants) : '',
      isActive: c.isActive,
    });
    setEditId(c.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce cours ? Les séances associées ne seront pas supprimées.')) return;
    await deleteDoc(doc(db, 'courses', id));
    await load();
  };


  const getStyleName = (id: string) => danceStyles.find(s => s.id === id)?.name ?? id;
  const getStyleColor = (id: string) => danceStyles.find(s => s.id === id)?.color ?? '#6B7280';
  const getLevelName = (id: string) => levels.find(l => l.id === id)?.name ?? id;
  const getRoomName = (id: string) => rooms.find(r => r.id === id)?.name ?? id;
  const getSeasonLabel = (id: string) => seasons.find(s => s.id === id)?.label ?? id;
  const getInstructorName = (id?: string) => {
    if (!id) return null;
    const i = instructors.find(i => i.id === id);
    return i ? `${i.firstName} ${i.lastName}` : null;
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Cours</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {editId ? 'Modifier le cours' : 'Nouveau cours'}
        </h2>

        <div>
          <label className={labelCls}>Nom</label>
          <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="ex : Salsa niveau 1" className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Style de danse</label>
            <select value={form.danceStyleId} onChange={e => setForm(p => ({ ...p, danceStyleId: e.target.value }))} required className={inputCls}>
              <option value="">— Choisir —</option>
              {danceStyles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Niveau</label>
            <select value={form.levelId} onChange={e => setForm(p => ({ ...p, levelId: e.target.value }))} required className={inputCls}>
              <option value="">— Choisir —</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Salle</label>
            <select value={form.roomId} onChange={e => setForm(p => ({ ...p, roomId: e.target.value }))} required className={inputCls}>
              <option value="">— Choisir —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Saison</label>
            <select value={form.seasonId} onChange={e => setForm(p => ({ ...p, seasonId: e.target.value }))} required className={inputCls}>
              <option value="">— Choisir —</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={!form.isOneOff} onChange={() => setForm(p => ({ ...p, isOneOff: false }))} />
            Récurrent (toutes les semaines sur la saison)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" checked={form.isOneOff} onChange={() => setForm(p => ({ ...p, isOneOff: true }))} />
            Séance ponctuelle (une seule date)
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            {form.isOneOff ? (
              <>
                <label className={labelCls}>Date</label>
                <input type="date" value={form.oneOffDate} onChange={e => setForm(p => ({ ...p, oneOffDate: e.target.value }))} required className={inputCls} />
              </>
            ) : (
              <>
                <label className={labelCls}>Jour</label>
                <select value={form.dayOfWeek} onChange={e => setForm(p => ({ ...p, dayOfWeek: e.target.value }))} required className={inputCls}>
                  {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                </select>
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Début</label>
            <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Fin</label>
            <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} required className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Professeur (optionnel)</label>
            <select value={form.instructorId} onChange={e => setForm(p => ({ ...p, instructorId: e.target.value }))} className={inputCls}>
              <option value="">— Aucun —</option>
              {instructors.map(i => <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Nb max participants (optionnel)</label>
            <input type="number" value={form.maxParticipants} onChange={e => setForm(p => ({ ...p, maxParticipants: e.target.value }))} min={1} placeholder="illimité" className={inputCls} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="rounded" />
          Cours actif
        </label>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
            {saving ? 'Sauvegarde…' : editId ? 'Mettre à jour' : 'Créer'}
          </button>
          {editId && (
            <button type="button" onClick={() => { setForm(emptyForm); setEditId(null); }}
              className="border border-gray-300 text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-50 text-sm">
              Annuler
            </button>
          )}
        </div>
      </form>

      {loading ? <p className="text-gray-500 text-sm">Chargement…</p> : (
        <div className="space-y-3">
          {courses.length === 0 && <p className="text-gray-400 text-sm">Aucun cours créé.</p>}
          {courses.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getStyleColor(c.danceStyleId) }} />
                  <span className="font-semibold text-gray-900">{c.name}</span>
                  {!c.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactif</span>}
                  {c.isOneOff && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Ponctuel</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {getStyleName(c.danceStyleId)} · {getLevelName(c.levelId)} · {getRoomName(c.roomId)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {c.isOneOff && c.oneOffDate ? formatOneOffDate(c.oneOffDate) : DAY_LABELS[c.dayOfWeek]} {c.startTime}–{c.endTime} · {getSeasonLabel(c.seasonId)}
                  {getInstructorName(c.instructorId) && ` · ${getInstructorName(c.instructorId)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/admin/courses/${c.id}/sessions`} className="text-sm text-gray-500 hover:text-gray-800">
                  Séances
                </Link>
<button onClick={() => startEdit(c)} className="text-sm text-blue-600 hover:underline">Modifier</button>
                <button onClick={() => handleDelete(c.id)} className="text-sm text-red-500 hover:underline">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
