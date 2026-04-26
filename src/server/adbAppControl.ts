import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppControl, ForegroundAppState } from "./types.js";
import { isValidAndroidPackageName } from "./androidPackage.js";

interface AdbAppControlOptions {
  adbBin?: string;
  serial: string;
  adbKey?: string;
  adbKeyPub?: string;
  adbKeyDir?: string;
  commandTimeoutMs?: number;
  reconnectIntervalMs?: number;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 8000;
const DEFAULT_RECONNECT_INTERVAL_MS = 15000;
const COMPONENT_PACKAGE_PATTERN = /([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)\/[A-Za-z0-9_.$]+/;
const FOREGROUND_MARKERS = [
  /topResumedActivity/,
  /mResumedActivity/,
  /ResumedActivity/,
  /mFocusedApp/,
  /mCurrentFocus/,
  /\bACTIVITY\b/,
  /\bcmp=/
];

export class AdbAppControl implements AppControl {
  private readonly adbBin: string;
  private readonly serial: string;
  private readonly adbKey?: string;
  private readonly adbKeyPub?: string;
  private readonly adbKeyDir: string;
  private readonly commandTimeoutMs: number;
  private readonly reconnectIntervalMs: number;
  private adbKeyConfigured = false;
  private lastConnectAttemptAt = 0;

  constructor(options: AdbAppControlOptions) {
    this.adbBin = options.adbBin ?? "adb";
    this.serial = options.serial;
    this.adbKey = options.adbKey;
    this.adbKeyPub = options.adbKeyPub;
    this.adbKeyDir = options.adbKeyDir ?? join(homedir(), ".android");
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? DEFAULT_RECONNECT_INTERVAL_MS;
  }

  async getForegroundPackage(): Promise<ForegroundAppState> {
    const checkedAt = new Date().toISOString();

    for (const command of [
      ["dumpsys", "window"],
      ["dumpsys", "activity", "activities"]
    ]) {
      const result = await this.runShell(command);
      const packageName = parseForegroundPackage(result.stdout);
      if (packageName) {
        return { packageName, lastError: null, checkedAt };
      }
    }

    return { packageName: null, lastError: "foreground package not found", checkedAt };
  }

  async launchPackage(packageName: string): Promise<void> {
    if (!isValidAndroidPackageName(packageName)) {
      throw new Error("invalid package name");
    }

    const result = await this.runShell(["monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"]);
    const output = `${result.stdout}\n${result.stderr}`;
    if (/No activities found|monkey aborted|Error:/i.test(output)) {
      throw new Error(`failed to launch ${packageName}: ${firstNonEmptyLine(output) ?? "unknown adb error"}`);
    }
  }

  private async runShell(args: string[]): Promise<CommandResult> {
    await this.ensureConnected();
    return runCommand(this.adbBin, ["-s", this.serial, "shell", ...args], this.commandTimeoutMs);
  }

  private async ensureConnected(): Promise<void> {
    await this.ensureAdbKey();

    if (!this.serial.includes(":")) {
      return;
    }

    const now = Date.now();
    if (now - this.lastConnectAttemptAt < this.reconnectIntervalMs) {
      return;
    }

    await runCommand(this.adbBin, ["connect", this.serial], this.commandTimeoutMs);
    this.lastConnectAttemptAt = now;
  }

  private async ensureAdbKey(): Promise<void> {
    if (this.adbKeyConfigured) {
      return;
    }

    if (!this.adbKey && !this.adbKeyPub) {
      this.adbKeyConfigured = true;
      return;
    }

    await mkdir(this.adbKeyDir, { recursive: true });
    if (this.adbKey) {
      await writeFile(join(this.adbKeyDir, "adbkey"), normalizeAdbKey(this.adbKey), { mode: 0o600 });
    }
    if (this.adbKeyPub) {
      await writeFile(join(this.adbKeyDir, "adbkey.pub"), normalizeAdbKey(this.adbKeyPub), { mode: 0o644 });
    }

    this.adbKeyConfigured = true;
  }
}

export function parseForegroundPackage(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  if (isValidAndroidPackageName(trimmed)) {
    return trimmed;
  }

  if (!trimmed.includes("\n")) {
    return packageFromComponent(trimmed);
  }

  const lines = trimmed.split(/\r?\n/);
  for (const marker of FOREGROUND_MARKERS) {
    for (const line of lines) {
      if (!marker.test(line)) {
        continue;
      }

      const packageName = packageFromComponent(line);
      if (packageName) {
        return packageName;
      }
    }
  }

  return null;
}

function packageFromComponent(value: string): string | null {
  const match = COMPONENT_PACKAGE_PATTERN.exec(value);
  const packageName = match?.[1];
  return packageName && isValidAndroidPackageName(packageName) ? packageName : null;
}

function firstNonEmptyLine(value: string): string | null {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function normalizeAdbKey(value: string): string {
  const expanded = value.trim().replace(/\\n/g, "\n");
  return `${decodePemKeyIfBase64(expanded).trimEnd()}\n`;
}

function decodePemKeyIfBase64(value: string): string {
  if (value.includes("PRIVATE KEY") || !/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    return value;
  }

  try {
    const decoded = Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
    return decoded.includes("PRIVATE KEY") ? decoded : value;
  } catch {
    return value;
  }
}

function runCommand(file: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: timeoutMs
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = firstNonEmptyLine(stderr) ?? firstNonEmptyLine(stdout) ?? error.message;
          reject(new Error(message));
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}
