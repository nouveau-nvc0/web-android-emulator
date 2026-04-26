#!/bin/sh
set -eu

turn_host="${TURN_HOST:-localhost}"
turn_port="${TURN_PORT:-38002}"
turn_user_label="${TURN_USER:-remote}"
turn_shared_secret="${TURN_SHARED_SECRET:-}"
turn_credential_ttl="${TURN_CREDENTIAL_TTL_SECONDS:-3600}"
ice_transport_policy="${TURN_ICE_TRANSPORT_POLICY:-all}"
turn_stun_urls="${TURN_STUN_URLS:-stun:${turn_host}:${turn_port}}"

if [ -z "${turn_shared_secret}" ] || [ "${turn_shared_secret}" = "change-me" ]; then
  echo "TURN_SHARED_SECRET must be set to a strong random value" >&2
  exit 64
fi

expires_at="$(($(date +%s) + turn_credential_ttl))"
turn_username="${expires_at}:${turn_user_label}"
turn_password="$(printf '%s' "${turn_username}" | openssl dgst -binary -sha1 -hmac "${turn_shared_secret}" | base64)"

emit_json_url_array() {
  urls="$1"
  old_ifs="$IFS"
  IFS=","
  first=true

  for url in $urls; do
    if [ -z "$url" ]; then
      continue
    fi

    if [ "$first" = "false" ]; then
      printf ',\n'
    fi

    printf '        "%s"' "$url"
    first=false
  done

  IFS="$old_ifs"
}

printf '{\n  "iceServers": [\n'

if [ -n "$turn_stun_urls" ]; then
  printf '    {\n      "urls": [\n'
  emit_json_url_array "$turn_stun_urls"
  printf '\n      ]\n    },\n'
fi

cat <<EOF
    {
      "urls": [
        "turn:${turn_host}:${turn_port}?transport=udp",
        "turn:${turn_host}:${turn_port}?transport=tcp"
      ],
      "username": "${turn_username}",
      "credential": "${turn_password}"
    }
  ],
  "iceTransportPolicy": "${ice_transport_policy}"
}
EOF
