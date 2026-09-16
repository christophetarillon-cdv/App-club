#!/usr/bin/env bash
# Publie une OTA sur le canal `production` (clubvoiron-prod).
#
# `eas update` ignore totalement le bloc build.<profile>.env d'eas.json (ça
# ne s'applique qu'à `eas build`) : il bundle le JS en lisant les variables
# EXPO_PUBLIC_FIREBASE_* de l'environnement shell ambiant, sinon il retombe
# sur les valeurs par défaut codées dans src/lib/firebase.ts, qui pointent
# vers clubvoiron-dev. Oublier ces variables ici a déjà envoyé 3 fois un
# bundle "prod" configuré sur la base dev (30/08, 06/09, 16/09) — cette
# variante fixe est le remplacement de tout `eas update --branch production`
# lancé à la main.
set -euo pipefail
cd "$(dirname "$0")/.."

MESSAGE="${1:?Usage: pnpm run update:production -- \"message\"}"

export EXPO_PUBLIC_FIREBASE_API_KEY="AIzaSyCKIDFu3Ds2cJPgHiqVJdmQfZ3eGMOE71Q"
export EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="clubvoiron-prod.firebaseapp.com"
export EXPO_PUBLIC_FIREBASE_PROJECT_ID="clubvoiron-prod"
export EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="clubvoiron-prod.firebasestorage.app"
export EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="556748254588"
export EXPO_PUBLIC_FIREBASE_APP_ID="1:556748254588:web:28e35dc08d99d1657c08f9"
export EAS_SKIP_AUTO_FINGERPRINT=1

pnpm exec eas update --branch production --clear-cache --message "$MESSAGE" --non-interactive

echo ""
echo "Vérification du bundle publié (config embarquée)..."
BUNDLE=$(find dist/_expo/static/js/ios -iname "*.hbc" ! -iname "*.map" | head -1)
if [ -z "$BUNDLE" ]; then
  echo "ERREUR : bundle iOS introuvable dans dist/ — impossible de vérifier la config publiée." >&2
  exit 1
fi
if ! strings "$BUNDLE" | grep -q "AIzaSyCKIDFu3Ds2cJPgHiqVJdmQfZ3eGMOE71Q"; then
  echo "ERREUR CRITIQUE : le bundle production publié NE CONTIENT PAS la clé API clubvoiron-prod." >&2
  exit 1
fi
if strings "$BUNDLE" | grep -q "clubvoiron-dev.firebasestorage.app"; then
  echo "ERREUR CRITIQUE : le bundle production publié contient le bucket clubvoiron-dev." >&2
  exit 1
fi
echo "OK — bundle production vérifié : config clubvoiron-prod confirmée."
