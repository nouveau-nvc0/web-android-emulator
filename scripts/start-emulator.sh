#!/usr/bin/env sh
set -eu

validate_positive_int() {
  name="$1"
  value="$2"

  case "$value" in
    ""|*[!0-9]*)
      echo "emulator: $name must be a positive integer, got '$value'" >&2
      exit 2
      ;;
    0)
      echo "emulator: $name must be greater than zero" >&2
      exit 2
      ;;
  esac
}

append_resource_params() {
  case " $params " in
    *" -gpu "*) ;;
    *) params="$params -gpu software" ;;
  esac

  if [ -n "${EMULATOR_MEMORY_MB:-}" ]; then
    validate_positive_int EMULATOR_MEMORY_MB "$EMULATOR_MEMORY_MB"
    params="$params -memory $EMULATOR_MEMORY_MB"
  fi

  if [ -n "${EMULATOR_CORES:-}" ]; then
    validate_positive_int EMULATOR_CORES "$EMULATOR_CORES"
    params="$params -cores $EMULATOR_CORES"
  fi

  if [ -n "${EMULATOR_EXTRA_PARAMS:-}" ]; then
    params="$params $EMULATOR_EXTRA_PARAMS"
  fi
}

install_adb_keys() {
  mkdir -p /root/.android

  if [ -n "${ADBKEY:-}" ]; then
    printf '%s\n' "$ADBKEY" > /root/.android/adbkey
    chmod 600 /root/.android/adbkey
  fi

  if [ -n "${ADBKEY_PUB:-}" ]; then
    printf '%s\n' "$ADBKEY_PUB" > /root/.android/adbkey.pub
    chmod 644 /root/.android/adbkey.pub
  fi
}

start_pulse_audio() {
  if command -v pulseaudio >/dev/null 2>&1; then
    export PULSE_SERVER="${PULSE_SERVER:-unix:/tmp/pulse-socket}"
    pulseaudio -D --exit-idle-time=-1 >/tmp/pulse.log 2>&1 || true
  fi
}

start_adb_forwarders() {
  socat tcp-listen:5554,reuseaddr,fork tcp:127.0.0.1:5556 &
  socat tcp-listen:5555,reuseaddr,fork tcp:127.0.0.1:5557 &
}

if [ -x /android/sdk/launch-emulator.sh ]; then
  params="${EMULATOR_PARAMS:-${EMULATOR_BASE_PARAMS:--no-window -no-audio -no-boot-anim -gpu software -turncfg /usr/local/bin/turncfg.sh}}"
  append_resource_params

  export EMULATOR_PARAMS="$params"
  echo "emulator: effective EMULATOR_PARAMS=$EMULATOR_PARAMS"
  exec /android/sdk/launch-emulator.sh
fi

avd_name="${ANDROID_AVD_NAME:-test35}"
default_params="-avd $avd_name -ports 5556,5557 -grpc 8554 -no-window -no-audio -no-boot-anim -gpu software -turncfg /usr/local/bin/turncfg.sh -skip-adb-auth -no-snapshot-save -wipe-data"
params="${EMULATOR_PARAMS:-${EMULATOR_BASE_PARAMS:-$default_params}}"
append_resource_params

export EMULATOR_PARAMS="$params"
echo "emulator: effective EMULATOR_PARAMS=$EMULATOR_PARAMS"

install_adb_keys
start_pulse_audio
adb start-server >/tmp/adb-start-server.log 2>&1 || true
start_adb_forwarders

exec emulator $EMULATOR_PARAMS
