const APP_QUERY_PARAM = "app";
const ANDROID_PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

interface AppStateResponse {
  packageName?: string | null;
}

export function readUrlAppPackage(): string | null {
  const value = new URL(window.location.href).searchParams.get(APP_QUERY_PARAM);
  return value && isValidAndroidPackageName(value) ? value : null;
}

export function writeUrlAppPackage(packageName: string): void {
  if (!isValidAndroidPackageName(packageName)) {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(APP_QUERY_PARAM) === packageName) {
    return;
  }

  url.searchParams.set(APP_QUERY_PARAM, packageName);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export async function fetchForegroundAppPackage(): Promise<string | null> {
  const response = await fetch("/app-state", { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const state = (await response.json()) as AppStateResponse;
  return state.packageName && isValidAndroidPackageName(state.packageName) ? state.packageName : null;
}

export async function launchAppPackage(packageName: string): Promise<void> {
  if (!isValidAndroidPackageName(packageName)) {
    return;
  }

  const response = await fetch("/launch-app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ packageName })
  });

  if (!response.ok) {
    throw new Error(`launch-app failed with ${response.status}`);
  }
}

function isValidAndroidPackageName(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    ANDROID_PACKAGE_NAME_PATTERN.test(value)
  );
}
