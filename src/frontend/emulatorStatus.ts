export interface EmulatorStatus {
  grpcAvailable: boolean | null;
  lastError: string | null;
  lastSuccessfulRefreshAt: string | null;
}

export async function fetchEmulatorStatus(): Promise<EmulatorStatus> {
  const response = await fetch("/emulator-status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`emulator-status failed with ${response.status}`);
  }

  return (await response.json()) as EmulatorStatus;
}
