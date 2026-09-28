export type Appearance = "system" | "light" | "dark"

export const APPEARANCE_STORAGE_KEY = "openspindle:appearance"
export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)"

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark"
}

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (isAppearance(value)) return value
  } catch {
    // System appearance remains available when storage is unavailable.
  }
  return "system"
}

export function applyAppearance(appearance: Appearance, systemDark: boolean) {
  const dark = appearance === "dark" || (appearance === "system" && systemDark)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

// Apply the saved preference before the page paints; React takes over after mount.
export const APPEARANCE_INIT_SCRIPT = `(() => {
  let appearance = "system";
  try {
    const saved = localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});
    if (saved === "light" || saved === "dark") appearance = saved;
  } catch {}
  const dark = appearance === "dark" || (appearance === "system" && matchMedia(${JSON.stringify(SYSTEM_DARK_QUERY)}).matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();`
