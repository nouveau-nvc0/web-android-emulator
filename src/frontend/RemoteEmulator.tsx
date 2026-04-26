import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Emulator } from "android-emulator-webrtc/emulator";
import { fetchForegroundAppPackage, launchAppPackage, readUrlAppPackage, writeUrlAppPackage } from "./appLinking";
import { getFrontendConfig, type DisplayConfig } from "./config";
import { fetchEmulatorStatus, type EmulatorStatus } from "./emulatorStatus";
import { installTouchOverlay, mediaContentRect } from "./touchOverlay";

const FALLBACK_STATUS: EmulatorStatus = {
  grpcAvailable: null,
  lastError: null,
  lastSuccessfulRefreshAt: null
};

export function RemoteEmulator(): ReactElement {
  const touchLayerRef = useRef<HTMLDivElement | null>(null);
  const videoLayerRef = useRef<HTMLDivElement | null>(null);
  const frontendConfig = useMemo(() => getFrontendConfig(), []);
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(() => frontendConfig.displayConfig);
  const [emulatorStatus, setEmulatorStatus] = useState<EmulatorStatus>(FALLBACK_STATUS);
  const [webrtcState, setWebrtcState] = useState("connecting");
  const [webrtcError, setWebrtcError] = useState<string | null>(null);
  const [debugPoints, setDebugPoints] = useState<Map<number, { x: number; y: number }>>(new Map());
  const grpcUri = frontendConfig.grpcWebUri;
  const enableMouseInput = frontendConfig.enableMouseInput;
  const debugOverlay = frontendConfig.touchDebug;
  const appLinkingEnabled = frontendConfig.appLinkingEnabled;
  const touchSocketUrl = useMemo(() => toWebSocketUrl("/touch"), []);

  useEffect(() => {
    let cancelled = false;

    async function loadDisplayConfig(): Promise<void> {
      const response = await fetch("/display-config");
      if (!response.ok) {
        throw new Error(`display-config failed with ${response.status}`);
      }

      const config = (await response.json()) as DisplayConfig;
      if (!cancelled) {
        setDisplayConfig(config);
      }
    }

    void loadDisplayConfig().catch((error: unknown) => {
      console.warn("display-config fetch failed; using fallback", error);
    });

    const interval = window.setInterval(() => {
      void loadDisplayConfig().catch((error: unknown) => {
        console.warn("display-config refresh failed; keeping current config", error);
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEmulatorStatus(): Promise<void> {
      const status = await fetchEmulatorStatus();
      if (!cancelled) {
        setEmulatorStatus(status);
      }
    }

    void loadEmulatorStatus().catch((error: unknown) => {
      if (!cancelled) {
        setEmulatorStatus({
          grpcAvailable: null,
          lastError: error instanceof Error ? error.message : String(error),
          lastSuccessfulRefreshAt: null
        });
      }
    });

    const interval = window.setInterval(() => {
      void loadEmulatorStatus().catch((error: unknown) => {
        if (!cancelled) {
          setEmulatorStatus((previous) => ({
            ...previous,
            lastError: error instanceof Error ? error.message : String(error)
          }));
        }
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const layer = touchLayerRef.current;
    if (!layer) {
      return undefined;
    }

    return installTouchOverlay({
      layer,
      socketUrl: touchSocketUrl,
      getDisplayConfig: () => displayConfig,
      getStageRect: () => mediaContentRect(videoLayerRef.current),
      enableMouseInput,
      onDebugPoints: debugOverlay ? setDebugPoints : undefined
    });
  }, [debugOverlay, displayConfig, enableMouseInput, touchSocketUrl]);

  useEffect(() => {
    if (!appLinkingEnabled) {
      return undefined;
    }

    let cancelled = false;
    let pendingLaunchPackage = readUrlAppPackage();
    let suppressUrlUpdatesUntil = pendingLaunchPackage ? Date.now() + 5000 : 0;

    async function launchFromUrl(packageName: string): Promise<void> {
      pendingLaunchPackage = packageName;
      suppressUrlUpdatesUntil = Date.now() + 5000;
      await launchAppPackage(packageName);
    }

    async function refreshForegroundApp(): Promise<void> {
      const packageName = await fetchForegroundAppPackage();
      if (cancelled || !packageName) {
        return;
      }

      if (pendingLaunchPackage && packageName !== pendingLaunchPackage && Date.now() < suppressUrlUpdatesUntil) {
        return;
      }

      pendingLaunchPackage = null;
      writeUrlAppPackage(packageName);
    }

    if (pendingLaunchPackage) {
      void launchFromUrl(pendingLaunchPackage)
        .catch((error: unknown) => {
          console.warn("launch-app failed", error);
        })
        .finally(() => {
          void refreshForegroundApp().catch(() => undefined);
        });
    } else {
      void refreshForegroundApp().catch(() => undefined);
    }

    const interval = window.setInterval(() => {
      void refreshForegroundApp().catch(() => undefined);
    }, 2000);

    const onPopState = (): void => {
      const packageName = readUrlAppPackage();
      if (!packageName) {
        return;
      }

      void launchFromUrl(packageName).catch((error: unknown) => {
        console.warn("launch-app failed", error);
      });
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("popstate", onPopState);
    };
  }, [appLinkingEnabled]);

  return (
    <main className="remoteStage" aria-label="Remote Android Emulator">
      <div className="videoLayer" ref={videoLayerRef}>
        <Emulator
          uri={grpcUri}
          view="webrtc"
          width={displayConfig.width}
          height={displayConfig.height}
          onStateChange={(state: string) => {
            setWebrtcState(state);
            if (state === "connected") {
              setWebrtcError(null);
            }
          }}
          onError={(error: unknown) => {
            setWebrtcError(formatError(error));
          }}
        />
      </div>
      <div id="touchLayer" ref={touchLayerRef} />
      <ConnectionStatus
        displayConfig={displayConfig}
        emulatorStatus={emulatorStatus}
        grpcUri={grpcUri}
        webrtcError={webrtcError}
        webrtcState={webrtcState}
      />
      {debugOverlay ? <DebugTouches points={debugPoints} /> : null}
    </main>
  );
}

function ConnectionStatus(props: {
  displayConfig: DisplayConfig;
  emulatorStatus: EmulatorStatus;
  grpcUri: string;
  webrtcError: string | null;
  webrtcState: string;
}): ReactElement | null {
  if (props.webrtcState === "connected" && props.emulatorStatus.grpcAvailable === true && !props.webrtcError) {
    return null;
  }

  const emulatorLine =
    props.emulatorStatus.grpcAvailable === false
      ? `Emulator gRPC unavailable: ${props.emulatorStatus.lastError ?? "connection failed"}`
      : props.emulatorStatus.grpcAvailable === true
        ? "Emulator gRPC available"
        : "Checking emulator gRPC";

  return (
    <aside className="statusPanel" aria-live="polite">
      <strong>WebRTC {props.webrtcState}</strong>
      <span>{emulatorLine}</span>
      {props.webrtcError ? <span>{props.webrtcError}</span> : null}
      <span>
        {props.grpcUri} · {props.displayConfig.width}x{props.displayConfig.height}
      </span>
    </aside>
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "WebRTC error";
}

function DebugTouches(props: { points: Map<number, { x: number; y: number }> }): ReactElement {
  return (
    <div className="debugTouches" aria-hidden="true">
      {[...props.points.entries()].map(([id, point]) => (
        <span
          key={id}
          className="debugTouch"
          style={{
            transform: `translate(${point.x * 100}vw, ${point.y * 100}vh)`
          }}
        />
      ))}
    </div>
  );
}

function toWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
