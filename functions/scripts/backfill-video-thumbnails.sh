#!/bin/bash
# Rattrapage des vignettes vidéo : pose thumbnailStatus=null sur chaque doc
# media vidéo sans thumbnailUrl, ce qui redéclenche generateVideoThumbnail.
# Usage : functions/scripts/backfill-video-thumbnails.sh clubvoiron-dev|clubvoiron-prod
set -euo pipefail
P=${1:?projet requis}
T=$(gcloud auth print-access-token)
BASE="https://firestore.googleapis.com/v1/projects/$P/databases/(default)/documents"
curl -s "$BASE/media?pageSize=500&mask.fieldPaths=type&mask.fieldPaths=thumbnailUrl" -H "Authorization: Bearer $T" \
 | python3 -c '
import json,sys
for d in json.load(sys.stdin).get("documents",[]):
  f=d["fields"]
  if f.get("type",{}).get("stringValue")=="video" and not f.get("thumbnailUrl",{}).get("stringValue"):
    print(d["name"])' \
 | while read -r name; do
  curl -s -X PATCH "https://firestore.googleapis.com/v1/$name?updateMask.fieldPaths=thumbnailStatus" \
    -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
    -d '{"fields":{"thumbnailStatus":{"nullValue":null}}}' >/dev/null && echo "relancé: ${name##*/}"
  sleep 2
done
