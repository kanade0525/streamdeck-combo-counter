#!/bin/sh
# 開発中のプラグインを Stream Deck に見せる（実体はこのリポジトリのまま）。
set -e
cd "$(dirname "$0")/.."
SRC="$(pwd)/com.kanade0525.pulse.sdPlugin"
DST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.kanade0525.pulse.sdPlugin"
ln -sfn "$SRC" "$DST"
echo "つないだ: $DST"
echo "Stream Deck を再起動すると読み込まれる"
