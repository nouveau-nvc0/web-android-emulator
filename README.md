# Remote Android Emulator

<p><strong>WARNING: This project was generated 100% by GPT-5.5 in Codex.</strong></p>

A web system for controlling Android Emulator from an Android phone browser. The emulator runs in Docker, video is streamed over WebRTC from `android-emulator-webrtc`, and touch/pen PointerEvents are sent over WebSocket to a Node.js bridge and then to Android Emulator gRPC.

```text
Android phone browser
  ├─ WebRTC video from emulator
  └─ WebSocket touch events
        ↓
Docker Compose
  ├─ proxy HTTPS/WSS
  ├─ app Node.js touch bridge
  ├─ envoy gRPC-Web proxy
  └─ emulator Android Emulator container
```

## Quick Start

You need a Linux host with `/dev/kvm`. Docker Desktop on macOS/Windows is not suitable for the Android Emulator container.

```bash
cp .env.example .env
docker compose up --build
```

Open from your phone:

```text
https://<LAN_HOST>:<HTTPS_PORT>/
```

`LAN_HOST`, `PUBLIC_HOST`, and `HTTPS_PORT` are configured in `.env`. Caddy still listens on port 443 inside the container, while Docker publishes it externally as `HTTPS_PORT`, so SNI matches the configured hostname/IP.

## Docker Emulator

Compose starts the `emulator` service from the hosted Android Emulator container image:

```env
EMULATOR_IMAGE=us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2
EMULATOR_GRPC=emulator:8554
EMULATOR_PARAMS=-no-window -no-audio -no-boot-anim -turncfg /usr/local/bin/turncfg.sh
```

Ports `8554`, `5554`, and `5555` are only exposed inside the Docker network and are not published externally.

For NAT traversal, Compose starts coturn. Forward these ports from your router to the Docker host:

```text
HTTPS_PORT tcp/udp
TURN_PORT tcp/udp
TURN_MIN_PORT-TURN_MAX_PORT udp
```

By default these are `38001 tcp/udp`, `38002 tcp/udp`, and `38010-38050 udp`.

ADB keys can be provided through `.env`:

```env
ADBKEY=
ADBKEY_PUB=
```

The web app also uses ADB inside the Compose network to detect and launch the foreground Android package. When you open an app in the emulator, the browser URL is updated to `?app=<package.name>`. Opening that URL later asks the emulator to launch the same package. If `ADBKEY` and `ADBKEY_PUB` are set, the app container writes them to its ADB client key path before connecting.

## Proto

The repository includes a minimal compatible `proto/emulator_controller.proto`. To use the SDK proto:

```bash
cp "$ANDROID_SDK_ROOT/emulator/lib/emulator_controller.proto" ./proto/emulator_controller.proto
# or
./scripts/copy-proto.sh
```

## Orientation

After boot, you can lock the emulator to portrait:

```bash
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
```

If ADB is not published externally, run this through your own debug access or temporarily add a local-only port mapping for setup. Do not publish ADB to the internet.

## Security

Only the HTTPS/WSS reverse proxy is exposed externally (`HTTP_PORT` and `HTTPS_PORT`). Do not publish `8554`, `5554`, or `5555`: emulator gRPC, console, and ADB are not intended for direct internet access.

If `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set, Caddy enables basic auth. If they are empty, the configuration is intended only for a private network. `LAN_HOST` always uses Caddy internal TLS. `PUBLIC_HOST` uses Caddy internal TLS by default, or Let's Encrypt DNS-01 through Cloudflare when `CADDY_ACME_DNS_CLOUDFLARE=true` and `CLOUDFLARE_API_TOKEN` is set. For internet access, use WireGuard/Tailscale or a complete authentication scheme.

The Cloudflare token must be a scoped API token with `Zone.Zone:Read` and `Zone.DNS:Edit` for the zone that contains `PUBLIC_HOST`. DNS-01 does not require inbound port 80 to be reachable, but `PUBLIC_HOST` must be a real DNS name in Cloudflare.

## Env

```env
PUBLIC_HOST=localhost
LAN_HOST=localhost
HTTPS_PORT=38001
HTTP_PORT=80
TURN_HOST=localhost
TURN_EXTERNAL_IP=
TURN_PORT=38002
TURN_MIN_PORT=38010
TURN_MAX_PORT=38050
TURN_REALM=remote-emulator
TURN_USER=remote
TURN_SHARED_SECRET=change-me
TURN_CREDENTIAL_TTL_SECONDS=3600
TURN_ICE_TRANSPORT_POLICY=relay
TURN_DENY_PRIVATE_PEERS=true
TURN_USER_QUOTA=2
TURN_TOTAL_QUOTA=20
TURN_MAX_BPS=2500000
TURN_BPS_CAPACITY=25000000
EMULATOR_GRPC=emulator:8554
EMULATOR_IMAGE=us-docker.pkg.dev/android-emulator-268719/images/30-google-x64:30.1.2
EMULATOR_PARAMS=-no-window -no-audio -no-boot-anim -turncfg /usr/local/bin/turncfg.sh
ADBKEY=
ADBKEY_PUB=
EMU_WIDTH=1080
EMU_HEIGHT=1920
EMU_DISPLAY=0
INPUT_MODE=unary
GRPC_WEB_URI=/grpc
ENABLE_MOUSE_INPUT=false
TOUCH_DEBUG=false
APP_CONTROL_ENABLED=true
EMULATOR_ADB_SERIAL=emulator:5555
ADB_BIN=adb
BASIC_AUTH_USER=
BASIC_AUTH_PASSWORD=
DEBUG_ROUTES=false
CADDY_ACME_EMAIL=
CADDY_ACME_DNS_CLOUDFLARE=false
CADDY_ACME_DNS_RESOLVERS=1.1.1.1
CLOUDFLARE_API_TOKEN=
```

`INPUT_MODE=unary` uses `sendTouch` and is the default for the Docker emulator image. `INPUT_MODE=stream` is kept for emulator builds where `streamInputEvent` is available.

`APP_CONTROL_ENABLED=true` enables URL app linking through ADB. `EMULATOR_ADB_SERIAL` points to the emulator ADB TCP endpoint inside the Compose network.

`TURN_SHARED_SECRET` must be a strong random value, for example:

```bash
openssl rand -base64 32
```

Coturn uses the TURN REST API: the browser receives short-lived HMAC credentials for `TURN_CREDENTIAL_TTL_SECONDS`, not a permanent password. `TURN_DENY_PRIVATE_PEERS=true` denies relay access to private/reserved IPv4 ranges so TURN cannot be used as a proxy into a local network. The Compose bridge network used by the emulator peer is the only intentional exception. Quotas and bandwidth limits reduce impact if temporary credentials leak.

## API

`GET /healthz`

```json
{ "ok": true }
```

`GET /display-config`

```json
{ "width": 1080, "height": 1920, "display": 0 }
```

`GET /emulator-status` shows emulator gRPC availability.

`GET /app-state` shows the foreground Android package when ADB is available.

`POST /launch-app`

```json
{ "packageName": "com.android.settings" }
```

WebSocket endpoint: `/touch`.

```json
{
  "type": "down",
  "id": 17,
  "x": 0.42,
  "y": 0.77,
  "pressure": 0.8,
  "pointerType": "touch"
}
```

## Checks

```bash
npm run build
npm test
npm run test:e2e
docker compose config
```

## Troubleshooting

If the screen is black:

- check `docker compose ps`: `emulator`, `app`, `envoy`, and `proxy` should be `Up`;
- check `docker compose logs emulator`;
- check `GET /emulator-status`;
- make sure `/dev/kvm` is available on the host;
- wait for emulator boot; the first image start can take several minutes.

If WebRTC does not connect:

- check `/grpc` through proxy/envoy;
- check that `TURN_HOST` resolves to the external address of your router;
- check that `TURN_EXTERNAL_IP` is the router WAN IP if coturn runs behind NAT;
- check firewall/port forwarding: `HTTPS_PORT tcp/udp`, `TURN_PORT tcp/udp`, `TURN_MIN_PORT-TURN_MAX_PORT udp`;
- use WireGuard/Tailscale for remote access.

If touch coordinates are offset or incorrect:

- check `GET /display-config`;
- check Android orientation;
- check aspect ratio and letterboxing/pillarboxing.
