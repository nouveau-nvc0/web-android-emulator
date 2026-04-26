const MANIFEST_SELECTOR = 'link[rel="manifest"]';

export function syncManifestLink(packageName: string | null): void {
  const link = readOrCreateManifestLink();
  link.href = manifestHref(packageName);
}

export async function goFullscreen(): Promise<void> {
  if (isStandaloneDisplayMode() || document.fullscreenElement || !document.fullscreenEnabled) {
    return;
  }

  await document.documentElement.requestFullscreen({ navigationUI: "hide" });
}

export function installFullscreenRequest(): void {
  let armed = false;

  const requestFullscreen = (): void => {
    void goFullscreen()
      .then(() => {
        if (isStandaloneDisplayMode() || document.fullscreenElement) {
          disarm();
        }
      })
      .catch(() => undefined);
  };

  const arm = (): void => {
    if (armed || isStandaloneDisplayMode() || document.fullscreenElement || !document.fullscreenEnabled) {
      return;
    }

    window.addEventListener("pointerdown", requestFullscreen, true);
    window.addEventListener("keydown", requestFullscreen, true);
    armed = true;
  };

  const disarm = (): void => {
    if (!armed) {
      return;
    }

    window.removeEventListener("pointerdown", requestFullscreen, true);
    window.removeEventListener("keydown", requestFullscreen, true);
    armed = false;
  };

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement || isStandaloneDisplayMode()) {
      disarm();
    } else {
      arm();
    }
  });

  arm();
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
