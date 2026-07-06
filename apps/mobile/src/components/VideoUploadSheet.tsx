import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Pressable,
} from 'react-native';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { db, storage, functions } from '@/lib/firebase';
import { Colors } from '@/constants/Colors';

interface SeasonOpt { id: string; label: string; isActive: boolean; }
interface StyleOpt { id: string; name: string; color: string; }
interface CourseOpt { id: string; name: string; danceStyleId: string; levelId: string; }
interface LevelOpt { id: string; name: string; }

interface PickedFile { uri: string; name: string; size: number; mimeType: string; duration?: number; }

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function uniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export default function VideoUploadSheet({
  seasons, danceStyles, defaultSeasonId, onClose, onUploaded, fixedAttachedTo, fixedSeasonId, actingDancerId,
}: {
  seasons: SeasonOpt[];
  danceStyles: StyleOpt[];
  defaultSeasonId?: string;
  onClose: () => void;
  onUploaded: () => void;
  // Contexte "fiche détail de séance" : rattachement et saison déjà connus,
  // on masque les sélecteurs cours/saison et on les fige.
  fixedAttachedTo?: string;
  fixedSeasonId?: string | null;
  // Danseur actif (pas tout le compte) dont les rôles doivent être vérifiés
  // côté serveur pour l'upload (fiche détail de séance).
  actingDancerId?: string;
}) {
  const insets = useSafeAreaInsets();

  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [levels, setLevels] = useState<LevelOpt[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [seasonId, setSeasonId] = useState(defaultSeasonId && defaultSeasonId !== 'toutes' && defaultSeasonId !== 'intemporel' ? defaultSeasonId : '');
  const [attachedTo, setAttachedTo] = useState(fixedAttachedTo ?? ''); // '' = général, ou 'course:{id}' / 'session:{id}'
  const [file, setFile] = useState<PickedFile | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'courses'), orderBy('name'))),
      getDocs(query(collection(db, 'levels'), orderBy('order'))),
    ]).then(([courseSnap, levelSnap]) => {
      setCourses(courseSnap.docs.map(d => ({
        id: d.id, name: d.data().name ?? '',
        danceStyleId: d.data().danceStyleId ?? '', levelId: d.data().levelId ?? '',
      })));
      setLevels(levelSnap.docs.map(d => ({ id: d.id, name: d.data().name ?? '' })));
    }).catch(() => {});
  }, []);

  const selectedCourse = useMemo(
    () => attachedTo.startsWith('course:') ? courses.find(c => c.id === attachedTo.replace('course:', '')) : undefined,
    [attachedTo, courses],
  );
  const courseStyle = danceStyles.find(s => s.id === selectedCourse?.danceStyleId)?.name;
  const courseLevel = levels.find(l => l.id === selectedCourse?.levelId)?.name;

  const courseChipLabel = (c: CourseOpt): string => {
    const lvl = levels.find(l => l.id === c.levelId)?.name;
    return lvl ? `${c.name} · ${lvl}` : c.name;
  };

  const pickVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      setFile({
        uri: a.uri,
        name: a.fileName ?? `video_${Date.now()}.mp4`,
        size: a.fileSize ?? 0,
        mimeType: a.mimeType ?? 'video/mp4',
        duration: a.duration ? Math.round(a.duration / 1000) : undefined,
      });
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const canSubmit = !!title.trim() && !!file && !uploading;

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setUploading(true); setProgress(0);
    try {
      const res = await fetch(file.uri);
      const blob = await res.blob();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `media/${uniqueId()}/${Date.now()}_${safe}`;
      const task = uploadBytesResumable(storageRef(storage, path), blob, { contentType: file.mimeType });

      const sourceUrl = await new Promise<string>((resolve, reject) => {
        task.on('state_changed',
          snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)),
        );
      });

      const registerMedia = httpsCallable(functions, 'registerMedia');
      await registerMedia({
        storagePath: path,
        sourceUrl,
        title: title.trim(),
        description: description.trim() || null,
        type: 'video',
        seasonId: (fixedAttachedTo ? fixedSeasonId : seasonId) || null,
        attachedTo: attachedTo || null,
        actingDancerId: actingDancerId || null,
        mimeType: file.mimeType,
        sizeBytes: (blob as any).size || file.size,
        durationSeconds: file.duration,
        isPublic: false,
      });

      Alert.alert('Vidéo envoyée', "Elle apparaîtra après l'encodage (quelques instants).");
      onUploaded();
      onClose();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Échec de l'envoi de la vidéo.");
    } finally {
      setUploading(false);
    }
  };

  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={uploading}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={uploading ? undefined : onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Ajouter une vidéo</Text>
          <TouchableOpacity onPress={onClose} disabled={uploading} hitSlop={10}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path d="M6 6l12 12M18 6L6 18" stroke={Colors.textSecondary} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Titre *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Titre de la vidéo"
            placeholderTextColor={Colors.textLight}
            editable={!uploading}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optionnel"
            placeholderTextColor={Colors.textLight}
            multiline
            editable={!uploading}
          />

          {!fixedAttachedTo && (
            <>
              <Text style={styles.label}>Saison</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip active={seasonId === ''} label="Intemporel" onPress={() => setSeasonId('')} />
                {seasons.map(s => (
                  <Chip key={s.id} active={seasonId === s.id} label={s.label + (s.isActive ? ' • en cours' : '')} onPress={() => setSeasonId(s.id)} />
                ))}
              </ScrollView>

              <Text style={styles.label}>Cours</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip active={attachedTo === ''} label="Général (club)" onPress={() => setAttachedTo('')} />
                {courses.map(c => (
                  <Chip key={c.id} active={attachedTo === `course:${c.id}`} label={courseChipLabel(c)} onPress={() => setAttachedTo(`course:${c.id}`)} />
                ))}
              </ScrollView>
            </>
          )}

          {selectedCourse && (
            <View style={styles.tagsInfo}>
              <Text style={styles.tagsInfoText}>
                Style : <Text style={styles.tagsInfoStrong}>{courseStyle ?? '—'}</Text>   ·   Niveau : <Text style={styles.tagsInfoStrong}>{courseLevel ?? '—'}</Text>
              </Text>
            </View>
          )}

          <Text style={styles.label}>Fichier vidéo *</Text>
          <TouchableOpacity style={styles.fileBtn} onPress={pickVideo} disabled={uploading} activeOpacity={0.8}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" stroke="#2F86C0" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.fileBtnText}>{file ? 'Changer de vidéo' : 'Choisir une vidéo'}</Text>
          </TouchableOpacity>
          {file && (
            <Text style={styles.fileMeta} numberOfLines={1}>{file.name} · {formatSize(file.size)}</Text>
          )}

          {uploading && (
            <View style={styles.progressWrap}>
              <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
              <Text style={styles.progressText}>Envoi en cours… {progress}%</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
            onPress={handleUpload}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Envoyer la vidéo</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '90%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D3D1C7', marginBottom: 10 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },

  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: Colors.text },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },

  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 20, paddingHorizontal: 14, height: 38, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#2F86C0', borderColor: '#2F86C0' },
  chipText: { fontSize: 13, color: Colors.textSecondary, maxWidth: 200 },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  tagsInfo: { marginTop: 10, backgroundColor: '#EEF6FB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  tagsInfoText: { fontSize: 13, color: '#185FA5' },
  tagsInfoStrong: { fontWeight: '700' },

  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  fileBtnText: { fontSize: 15, fontWeight: '500', color: '#2F86C0' },
  fileMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, paddingHorizontal: 4 },

  progressWrap: { marginTop: 16 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#2F86C0', borderRadius: 4 },
  progressText: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, textAlign: 'center' },

  submitBtn: { backgroundColor: Colors.orange, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
