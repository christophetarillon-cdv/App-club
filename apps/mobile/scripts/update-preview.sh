#!/usr/bin/env bash
# Publie une OTA sur le canal `preview` (clubvoiron-dev).
#
# Les variables EXPO_PUBLIC_FIREBASE_* sont fixées explicitement ici (plutôt
# que de compter sur les valeurs par défaut de src/lib/firebase.ts) pour ne
# jamais hériter silencieusement d'une config prod laissée dans le shell par
# une commande précédente — voir scripts/update-production.sh pour le
# contexte complet de ce piège (déjà vécu 3 fois en sens inverse).
set -euo pipefail
cd "$(dirname "$0")/.."

MESSAGE="${1:?Usage: pnpm run update:preview -- \"message\"}"

export EXPO_PUBLIC_FIREBASE_API_KEY="AIzaSyDpKbSvSu5CM3wdoBhCyaZyEAGGbtPs9dQ"
export EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="clubvoiron-dev.firebaseapp.com"
export EXPO_PUBLIC_FIREBASE_PROJECT_ID="clubvoiron-dev"
export EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="clubvoiron-dev.firebasestorage.app"
export EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="959510245510"
export EXPO_PUBLIC_FIREBASE_APP_ID="1:959510245510:web:44e18876571434366aa107"
export EAS_SKIP_AUTO_FINGERPRINT=1

pnpm exec eas update --branch preview --clear-cache --message "$MESSAGE" --non-interactive

echo ""
echo "Vérification du bundle publié (config embarquée)..."
BUNDLE=$(find dist/_expo/static/js/ios -iname "*.hbc" ! -iname "*.map" | head -1)
if [ -z "$BUNDLE" ]; then
  echo "ERREUR : bundle iOS introuvable dans dist/ — impossible de vérifier la config publiée." >&2
  exit 1
fi
if ! strings "$BUNDLE" | grep -q "AIzaSyDpKbSvSu5CM3wdoBhCyaZyEAGGbtPs9dQ"; then
  echo "ERREUR CRITIQUE : le bundle preview publié NE CONTIENT PAS la clé API clubvoiron-dev." >&2
  exit 1
fi
if strings "$BUNDLE" | grep -q "clubvoiron-prod.firebasestorage.app"; then
  echo "ERREUR CRITIQUE : le bundle preview publié contient le bucket clubvoiron-prod." >&2
  exit 1
fi
echo "OK — bundle preview vérifié : config clubvoiron-dev confirmée."
