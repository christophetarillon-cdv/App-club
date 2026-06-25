import { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

// Cache module-level : évite de régénérer la vignette à chaque rendu/scroll.
const cache = new Map<string, string>();

export default function VideoThumbnail({
  videoUrl, thumbnailUrl, fallbackColor,
}: {
  videoUrl?: string;
  thumbnailUrl?: string | null;
  fallbackColor: string;
}) {
  const [src, setSrc] = useState<string | null>(thumbnailUrl ?? (videoUrl ? cache.get(videoUrl) ?? null : null));

  useEffect(() => {
    if (thumbnailUrl) { setSrc(thumbnailUrl); return; }
    if (!videoUrl || cache.has(videoUrl)) return;
    let active = true;
    VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1000, quality: 0.5 })
      .then(({ uri }) => { cache.set(videoUrl, uri); if (active) setSrc(uri); })
      .catch(() => {});
    return () => { active = false; };
  }, [videoUrl, thumbnailUrl]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackColor, borderRadius: 14, overflow: 'hidden' }]}>
      {src && <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
    </View>
  );
}
