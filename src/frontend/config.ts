interface RemoteEmulatorRuntimeConfig {
  grpcWebUri?: string;
  enableMouseInput?: boolean;
  touchDebug?: boolean;
  appLinkingEnabled?: boolean;
  displayConfig?: Partial<DisplayConfig>;
}

export interface DisplayConfig {
  width: number;
  height: number;
  display: number;
}

export interface FrontendConfig {
  grpcWebUri: string;
  enableMouseInput: boolean;
  touchDebug: boolean;
  appLinkingEnabled: boolean;
  displayConfig: DisplayConfig;
}

let frontendConfig = fallbackConfig();

export async function loadFrontendConfig(): Promise<void> {
  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`config.json failed with ${response.status}`);
  }

  const runtime = (await response.json()) as RemoteEmulatorRuntimeConfig;
  const fallback = fallbackConfig();
  frontendConfig = {
    ...fallback,
    ...runtime,
    displayConfig: normalizeDisplayConfig(runtime.displayConfig, fallback.displayConfig)
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
    appLinkingEnabled: import.meta.env.VITE_APP_LINKING_ENABLED !== "false",
    displayConfig: {
      width: readPositiveInt(import.meta.env.VITE_EMU_WIDTH, 1080),
      height: readPositiveInt(import.meta.env.VITE_EMU_HEIGHT, 2400),
      display: readNonNegativeInt(import.meta.env.VITE_EMU_DISPLAY, 0)
    }
  };
}

function normalizeDisplayConfig(value: Partial<DisplayConfig> | undefined, fallback: DisplayConfig): DisplayConfig {
  return {
    width: readPositiveInt(value?.width, fallback.width),
    height: readPositiveInt(value?.height, fallback.height),
    display: readNonNegativeInt(value?.display, fallback.display)
  };
}

function readPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
