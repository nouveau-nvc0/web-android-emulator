#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_SDK_ROOT is not set" >&2
  exit 1
fi

SOURCE="$ANDROID_SDK_ROOT/emulator/lib/emulator_controller.proto"
TARGET="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/proto/emulator_controller.proto"

if [[ ! -f "$SOURCE" ]]; then
  echo "Proto not found: $SOURCE" >&2
  exit 1
fi

cp "$SOURCE" "$TARGET"
echo "Copied $SOURCE to $TARGET"
