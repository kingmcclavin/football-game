#!/bin/sh
# Emulator-based ROM tests (needs libmgba-dev). Runs scripted sessions
# headlessly, fails on hangs (frame counter stuck) and writes screenshots
# to build/screens/.
set -e
cd "$(dirname "$0")/.."
ROM=build/RetroFootball.gba
RUNNER=build/mgba_runner
OUT=build/screens
mkdir -p "$OUT"
ALIVE=$(grep -E '^ +0x[0-9a-f]+ +g_frame$' build/RetroFootball.map | awk '{print $1}')
if [ -z "$ALIVE" ]; then
    echo "romtest: g_frame not found in map file" >&2
    exit 1
fi
status=0
for t in smoke season demo fuzz; do
    script="$OUT/$t.script"
    { echo "alive $ALIVE"; sed "s#@OUT@#$OUT#g" "tests/rom/$t.txt"; } > "$script"
    rm -f "$OUT/$t.sav"
    if "$RUNNER" "$ROM" "$script" "$OUT/$t.sav" > "$OUT/$t.log" 2>&1; then
        echo "romtest: $t ok"
    else
        echo "romtest: $t FAILED (see $OUT/$t.log)"
        cat "$OUT/$t.log"
        status=1
    fi
done
if python3 -c "import PIL" 2>/dev/null; then
    python3 tools/shots2png.py "$OUT"
fi
exit $status
