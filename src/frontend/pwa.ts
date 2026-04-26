const MANIFEST_SELECTOR = 'link[rel="manifest"]';

export function syncManifestLink(packageName: string | null): void {
  const link = readOrCreateManifestLink();
  link.href = manifestHref(packageName);
}

export function installFullscreenRequest(): void {
  const requestFullscreen = (): void => {
    if (isStandaloneDisplayMode() || document.fullscreenElement || !document.fullscreenEnabled) {
      return;
    }

    void document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => {
        window.removeEventListener("pointerdown", requestFullscreen, true);
        window.removeEventListener("keydown", requestFullscreen, true);
      })
      .catch(() => undefined);
  };

  window.addEventListener("pointerdown", requestFullscreen, true);
  window.addEventListener("keydown", requestFullscreen, true);
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

function readOrCreateManifestLink(): HTMLLinkElement {
  const current = document.querySelector<HTMLLinkElement>(MANIFEST_SELECTOR);
  if (current) {
    return current;
  }

  const link = document.createElement("link");
  link.rel = "manifest";
  document.head.append(link);
  return link;
}

function manifestHref(packageName: string | null): string {
  const params = new URLSearchParams();
  if (packageName) {
    params.set("app", packageName);
  }

  const query = params.toString();
  return query ? `/manifest.webmanifest?${query}` : "/manifest.webmanifest";
}

function isStandaloneDisplayMode(): boolean {
  return window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: standalone)").matches;
}
