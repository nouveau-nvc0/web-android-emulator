import { describe, expect, it } from "vitest";
import { parseForegroundPackage } from "../../src/server/adbAppControl";

describe("parseForegroundPackage", () => {
  it("reads the focused app package from dumpsys window output", () => {
    expect(
      parseForegroundPackage(`
        mCurrentFocus=Window{d2f6 u0 com.android.settings/com.android.settings.Settings}
      `)
    ).toBe("com.android.settings");
  });

  it("prefers resumed activity over system UI focus", () => {
    expect(
      parseForegroundPackage(`
        mCurrentFocus=Window{abcd u0 com.android.systemui/com.android.systemui.statusbar.phone.StatusBar}
        topResumedActivity=ActivityRecord{1234 u0 com.example.app/.MainActivity t42}
      `)
    ).toBe("com.example.app");
  });

  it("returns null when no foreground component is present", () => {
    expect(parseForegroundPackage("Display 0 info only")).toBeNull();
  });
});
