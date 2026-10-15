#!/bin/sh
# Build Pixel Pigskin -> build/RetroFootball.gba
#   ./build.sh          build the ROM
#   ./build.sh test     also run host + emulator tests
set -e
cd "$(dirname "$0")"
if ! command -v arm-none-eabi-gcc >/dev/null 2>&1; then
    if [ -n "$DEVKITARM" ] && [ -x "$DEVKITARM/bin/arm-none-eabi-gcc" ]; then
        PATH="$DEVKITARM/bin:$PATH"; export PATH
    else
        echo "error: arm-none-eabi-gcc not found." >&2
        echo "  Ubuntu/Debian: sudo apt-get install gcc-arm-none-eabi libnewlib-arm-none-eabi make python3" >&2
        echo "  or install devkitARM and set DEVKITARM." >&2
        exit 1
    fi
fi
command -v python3 >/dev/null 2>&1 || { echo "error: python3 is required" >&2; exit 1; }
make
if [ "$1" = "test" ]; then
    make test
    make romtest
fi
echo "ROM ready: $(pwd)/build/RetroFootball.gba"
