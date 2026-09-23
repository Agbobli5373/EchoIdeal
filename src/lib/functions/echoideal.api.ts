import { invoke } from "@tauri-apps/api/core";
import { safeLocalStorage } from "../storage";
import { STORAGE_KEYS } from "@/config";
import { PREMIUM_FEATURES_ENABLED } from "@/config/feature-flags";

// The hosted-API switch lived on the removed licence page. Clearing the stored
// flag on every start means nobody stays on the hosted API with no way off.
export function retireEchoIdealApiFlag(): void {
  safeLocalStorage.removeItem(STORAGE_KEYS.ECHOIDEAL_API_ENABLED);
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
