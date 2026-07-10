import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DOWNLOAD_DIR_KEY = 'android_download_dir_uri';

async function writeToDir(dirUri: string, localUri: string, filename: string, mimeType: string) {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, filename, mimeType);
  await FileSystem.writeAsStringAsync(destUri, base64, { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Télécharge un fichier local vers le dossier choisi par l'utilisateur
 * (Android, via Storage Access Framework - le dossier n'est demandé qu'une
 * fois puis réutilisé) ou via la feuille de partage (iOS, ou si le choix
 * du dossier échoue sur Android).
 */
export async function saveDownloadedFile(localUri: string, filename: string, mimeType: string): Promise<'saved' | 'shared'> {
  if (Platform.OS === 'android') {
    const stored = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY);
    if (stored) {
      try {
        await writeToDir(stored, localUri, filename, mimeType);
        return 'saved';
      } catch {
        await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY);
      }
    }
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (result.granted) {
      await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, result.directoryUri);
      await writeToDir(result.directoryUri, localUri, filename, mimeType);
      return 'saved';
    }
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, { mimeType });
  }
  return 'shared';
}
