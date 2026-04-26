interface RemoteEmulatorRuntimeConfig {
  grpcWebUri?: string;
  enableMouseInput?: boolean;
  touchDebug?: boolean;
  appLinkingEnabled?: boolean;
}

interface FrontendConfig {
  grpcWebUri: string;
  enableMouseInput: boolean;
  touchDebug: boolean;
  appLinkingEnabled: boolean;
}

let frontendConfig = fallbackConfig();

export async function loadFrontendConfig(): Promise<void> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`config.json failed with ${response.status}`);
  }

  const runtime = (await response.json()) as RemoteEmulatorRuntimeConfig;
  frontendConfig = {
    ...fallbackConfig(),
    ...runtime
  };
}

export function getFrontendConfig(): FrontendConfig {
  return frontendConfig;
}

function fallbackConfig(): FrontendConfig {
  return {
    grpcWebUri: import.meta.env.VITE_GRPC_WEB_URI ?? "/grpc",
    enableMouseInput: import.meta.env.VITE_ENABLE_MOUSE_INPUT === "true",
    touchDebug: import.meta.env.VITE_TOUCH_DEBUG === "true",
    appLinkingEnabled: import.meta.env.VITE_APP_LINKING_ENABLED !== "false"
  };
}
