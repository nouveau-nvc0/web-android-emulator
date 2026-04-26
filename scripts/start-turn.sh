#!/bin/sh
set -eu

if [ -z "${TURN_SHARED_SECRET:-}" ] || [ "${TURN_SHARED_SECRET:-}" = "change-me" ]; then
  echo "TURN_SHARED_SECRET must be set to a strong random value" >&2
  exit 64
fi

first_ipv4() {
  for ip in $(hostname -i 2>/dev/null || true); do
    case "$ip" in
      *.*)
        printf '%s\n' "$ip"
        return 0
        ;;
    esac
  done

  return 1
}

container_ipv4="$(first_ipv4 || true)"
turn_listening_ip="${TURN_LISTENING_IP:-0.0.0.0}"
turn_relay_ip="${TURN_RELAY_IP:-$container_ipv4}"
turn_external_ip=""

set -- \
  turnserver \
  -n \
  --log-file=stdout \
  --use-auth-secret \
  --static-auth-secret="${TURN_SHARED_SECRET}" \
  --realm="${TURN_REALM:-remote-emulator}" \
  --fingerprint \
  --secure-stun \
  --no-multicast-peers \
  --no-tls \
  --no-dtls \
  --no-software-attribute \
  --stale-nonce="${TURN_STALE_NONCE_SECONDS:-600}" \
  --max-allocate-lifetime="${TURN_MAX_ALLOCATE_LIFETIME_SECONDS:-600}" \
  --permission-lifetime="${TURN_PERMISSION_LIFETIME_SECONDS:-300}" \
  --channel-lifetime="${TURN_CHANNEL_LIFETIME_SECONDS:-600}" \
  --user-quota="${TURN_USER_QUOTA:-2}" \
  --total-quota="${TURN_TOTAL_QUOTA:-20}" \
  --max-bps="${TURN_MAX_BPS:-2500000}" \
  --bps-capacity="${TURN_BPS_CAPACITY:-25000000}" \
  --allocation-default-address-family=ipv4 \
  --listening-ip="${turn_listening_ip}" \
  --listening-port="${TURN_PORT:-38002}" \
  --min-port="${TURN_MIN_PORT:-38010}" \
  --max-port="${TURN_MAX_PORT:-38050}"

if [ -n "${turn_relay_ip}" ]; then
  set -- "$@" --relay-ip="${turn_relay_ip}"
fi

if [ -n "${TURN_EXTERNAL_IP:-}" ]; then
  case "${TURN_EXTERNAL_IP}" in
    */*)
      turn_external_ip="${TURN_EXTERNAL_IP}"
      ;;
    *)
      if [ -n "${turn_relay_ip}" ]; then
        turn_external_ip="${TURN_EXTERNAL_IP}/${turn_relay_ip}"
      else
        turn_external_ip="${TURN_EXTERNAL_IP}"
      fi
      ;;
  esac

  set -- "$@" --external-ip="${turn_external_ip}"
fi

echo "turn: listening-ip=${turn_listening_ip} relay-ip=${turn_relay_ip:-<unset>} external-ip=${turn_external_ip:-<unset>} ports=${TURN_PORT:-38002}/${TURN_MIN_PORT:-38010}-${TURN_MAX_PORT:-38050}"

if [ "${TURN_DENY_PRIVATE_PEERS:-true}" = "true" ]; then
  # The emulator is a WebRTC peer inside the Compose bridge network. Keep the
  # rest of RFC1918 blocked, but allow the Docker subnet used here. Docker
  # Compose can allocate different 172.x subnets after the project restarts.
  TURN_DENIED_PEER_ARGS=

  add_denied_peer_ip() {
    TURN_DENIED_PEER_ARGS="${TURN_DENIED_PEER_ARGS} --denied-peer-ip=$1"
  }

  first_ip="$turn_relay_ip"
  first_octet="$(printf '%s' "$first_ip" | cut -d . -f 1)"
  second_octet="$(printf '%s' "$first_ip" | cut -d . -f 2)"
  third_octet="$(printf '%s' "$first_ip" | cut -d . -f 3)"

  add_denied_peer_ip 0.0.0.0-0.255.255.255
  if [ "$first_octet" = "10" ]; then
    if [ "$second_octet" -gt 0 ]; then
      add_denied_peer_ip "10.0.0.0-10.$((second_octet - 1)).255.255"
    fi
    if [ "$second_octet" -lt 255 ]; then
      add_denied_peer_ip "10.$((second_octet + 1)).0.0-10.255.255.255"
    fi
  else
    add_denied_peer_ip 10.0.0.0-10.255.255.255
  fi
  add_denied_peer_ip 100.64.0.0-100.127.255.255
  add_denied_peer_ip 127.0.0.0-127.255.255.255
  add_denied_peer_ip 169.254.0.0-169.254.255.255
  if [ "$first_octet" = "172" ] && [ "$second_octet" -ge 16 ] && [ "$second_octet" -le 31 ]; then
    if [ "$second_octet" -gt 16 ]; then
      add_denied_peer_ip "172.16.0.0-172.$((second_octet - 1)).255.255"
    fi
    if [ "$second_octet" -lt 31 ]; then
      add_denied_peer_ip "172.$((second_octet + 1)).0.0-172.31.255.255"
    fi
  else
    add_denied_peer_ip 172.16.0.0-172.31.255.255
  fi
  add_denied_peer_ip 192.0.0.0-192.0.0.255
  add_denied_peer_ip 192.0.2.0-192.0.2.255
  if [ "$first_octet" = "192" ] && [ "$second_octet" = "168" ]; then
    if [ "$third_octet" -gt 0 ]; then
      add_denied_peer_ip "192.168.0.0-192.168.$((third_octet - 1)).255"
    fi
    if [ "$third_octet" -lt 255 ]; then
      add_denied_peer_ip "192.168.$((third_octet + 1)).0-192.168.255.255"
    fi
  else
    add_denied_peer_ip 192.168.0.0-192.168.255.255
  fi
  add_denied_peer_ip 198.18.0.0-198.19.255.255
  add_denied_peer_ip 198.51.100.0-198.51.100.255
  add_denied_peer_ip 203.0.113.0-203.0.113.255
  add_denied_peer_ip 224.0.0.0-239.255.255.255
  add_denied_peer_ip 240.0.0.0-255.255.255.255

  # shellcheck disable=SC2086
  set -- "$@" $TURN_DENIED_PEER_ARGS
fi

exec "$@"
