import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Temps minimal passé en arrière-plan avant de vérifier une mise à jour au
// retour au premier plan : un simple aller-retour (copier un code, répondre à
// un SMS) ne doit pas redémarrer l'app sous les doigts de l'adhérent.
const MIN_BACKGROUND_MS = 2 * 60 * 1000;

// Applique une mise à jour OTA sans attendre deux ouvertures de l'app.
// Par défaut, expo-updates télécharge la mise à jour au lancement mais ne
// l'utilise qu'au lancement SUIVANT : il fallait fermer l'app deux fois. Ici,
// au démarrage et au retour au premier plan (après au moins 2 minutes en
// arrière-plan), on vérifie, on télécharge et on redémarre aussitôt sur la
// nouvelle version.
export function useOtaAutoUpdate() {
  const backgroundSince = useRef<number | null>(null);
  const running = useRef(false);

  useEffect(() => {
    // Inactif en développement (Metro) et dans les builds sans expo-updates.
    if (__DEV__ || !Updates.isEnabled) return;

    const checkAndApply = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew) await Updates.reloadAsync();
      } catch (err) {
        // Pas de réseau, serveur indisponible… : on réessaiera au prochain
        // retour au premier plan ; le mécanisme par défaut reste en place.
        console.warn('[useOtaAutoUpdate] check failed:', err);
      } finally {
        running.current = false;
      }
    };

    checkAndApply();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundSince.current = Date.now();
      } else if (state === 'active') {
        const since = backgroundSince.current;
        backgroundSince.current = null;
        if (since !== null && Date.now() - since >= MIN_BACKGROUND_MS) checkAndApply();
      }
    });
    return () => sub.remove();
  }, []);
}

// Ligne de version pour le profil, ex. « Version 1.0.1 · mise à jour du
// 26 nov., 14:30 » — pour vérifier d'un coup d'œil qu'un adhérent a bien
// reçu la dernière mise à jour.
export function appVersionLabel(): string {
  const version = Updates.runtimeVersion ?? '';
  const base = version ? `Version ${version}` : 'Version';
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return base;
  const when = Updates.createdAt.toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return `${base} · mise à jour du ${when}`;
}
