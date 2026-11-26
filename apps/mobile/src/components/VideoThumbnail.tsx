import { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

// Cache module-level : évite de régénérer la vignette à chaque rendu/scroll.
const cache = new Map<string, string>();

// `thumbnailUrl` (JPEG généré côté serveur) est la source normale. Extraire
// une image depuis `videoUrl` oblige à télécharger une partie de la vidéo à
// chaque lancement de l'app : c'était la cause principale de la facture
// Storage. On ne le fait donc que si l'appelant le demande explicitement
// (`generateFromVideo`), pour les petites vidéos du chat qui n'ont pas de
// vignette serveur. Sinon, sans vignette : simple fond de couleur.
export default function VideoThumbnail({
  videoUrl, thumbnailUrl, fallbackColor, generateFromVideo = false,
}: {
  videoUrl?: string;
  thumbnailUrl?: string | null;
  fallbackColor: string;
  generateFromVideo?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(thumbnailUrl ?? (videoUrl ? cache.get(videoUrl) ?? null : null));

  useEffect(() => {
    if (thumbnailUrl) { setSrc(thumbnailUrl); return; }
    if (!generateFromVideo || !videoUrl || cache.has(videoUrl)) return;
    let active = true;
    VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.5 })
      .then(({ uri }) => { cache.set(videoUrl, uri); if (active) setSrc(uri); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoUrl, thumbnailUrl, generateFromVideo]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor, borderRadius: 14, overflow: 'hidden' }]}>
      {src && <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
    </View>
  );
}
