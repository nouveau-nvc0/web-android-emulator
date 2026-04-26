#!/bin/sh
set -eu

if [ -z "${TURN_SHARED_SECRET:-}" ] || [ "${TURN_SHARED_SECRET:-}" = "change-me" ]; then
  echo "TURN_SHARED_SECRET must be set to a strong random value" >&2
  exit 64
fi

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
  --listening-port="${TURN_PORT:-38002}" \
  --min-port="${TURN_MIN_PORT:-38010}" \
  --max-port="${TURN_MAX_PORT:-38050}"

if [ -n "${TURN_EXTERNAL_IP:-}" ]; then
  set -- "$@" --external-ip="${TURN_EXTERNAL_IP}"
fi

if [ "${TURN_DENY_PRIVATE_PEERS:-true}" = "true" ]; then
  # The emulator is a WebRTC peer inside the Compose bridge network. Keep the
  # rest of RFC1918 blocked, but allow the narrow Docker subnet used here.
  set -- "$@" \
    --denied-peer-ip=0.0.0.0-0.255.255.255 \
    --denied-peer-ip=10.0.0.0-10.255.255.255 \
    --denied-peer-ip=100.64.0.0-100.127.255.255 \
    --denied-peer-ip=127.0.0.0-127.255.255.255 \
    --denied-peer-ip=169.254.0.0-169.254.255.255 \
    --denied-peer-ip=172.16.0.0-172.17.255.255 \
    --denied-peer-ip=172.18.1.0-172.31.255.255 \
    --denied-peer-ip=192.0.0.0-192.0.0.255 \
    --denied-peer-ip=192.0.2.0-192.0.2.255 \
    --denied-peer-ip=192.168.0.0-192.168.255.255 \
    --denied-peer-ip=198.18.0.0-198.19.255.255 \
    --denied-peer-ip=198.51.100.0-198.51.100.255 \
    --denied-peer-ip=203.0.113.0-203.0.113.255 \
    --denied-peer-ip=224.0.0.0-239.255.255.255 \
    --denied-peer-ip=240.0.0.0-255.255.255.255
fi

exec "$@"
