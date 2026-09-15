#!/bin/sh
# 配布用の .streamDeckPlugin を作る。
# 依存パッケージを同梱する必要があるため、プラグイン側で npm install してから固める。
set -e
cd "$(dirname "$0")/.."
sh scripts/build.sh
(cd com.kanade0525.pulse.sdPlugin && npm install --omit=dev)
npx --yes @elgato/cli@latest pack com.kanade0525.pulse.sdPlugin --output .
echo "できた:"
ls -la *.streamDeckPlugin
