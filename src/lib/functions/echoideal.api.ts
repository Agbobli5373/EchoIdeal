import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "../storage";
import { STORAGE_KEYS } from "@/config";
import { PREMIUM_FEATURES_ENABLED } from "@/config/feature-flags";

export async function clearLicense(): Promise<void> {
  await invoke("clear_license");
}

export async function shouldUseEchoIdealAPI(): Promise<boolean> {
  try {
    // Check if EchoIdeal API is enabled in localStorage
    const echoidealApiEnabled =
      safeLocalStorage.getItem(STORAGE_KEYS.ECHOIDEAL_API_ENABLED) === "true";
    if (!echoidealApiEnabled) return false;

    if (PREMIUM_FEATURES_ENABLED) return true;

    // Check if license is available
    const hasLicense = await invoke<boolean>("check_license_status");
    return hasLicense;
  } catch (error) {
    console.warn("Failed to check EchoIdeal API availability:", error);
    return false;
  }
}
