import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import type { ReactNode } from "react"
import type { Appearance } from "@/lib/appearance"
import {
  APPEARANCE_STORAGE_KEY,
  SYSTEM_DARK_QUERY,
  applyAppearance,
  isAppearance,
  readAppearance,
} from "@/lib/appearance"

const AppearanceContext = createContext<{
  appearance: Appearance
  setAppearance: (appearance: Appearance) => void
  saveError: string | null
} | null>(null)

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setPreference] = useState<Appearance | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const syncPreference = () => {
      setPreference(readAppearance())
      setSaveError(null)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
        syncPreference()
      }
    }
    syncPreference()
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (appearance === null) return
    const system = window.matchMedia(SYSTEM_DARK_QUERY)
    const update = () => applyAppearance(appearance, system.matches)
    update()
    system.addEventListener("change", update)
    return () => system.removeEventListener("change", update)
  }, [appearance])

  const setAppearance = useCallback((value: Appearance) => {
    if (!isAppearance(value)) return
    setPreference(value)
    applyAppearance(value, window.matchMedia(SYSTEM_DARK_QUERY).matches)
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, value)
      setSaveError(null)
    } catch {
      setSaveError(
        "This appearance is applied, but could not be saved. Try again."
      )
    }
  }, [])

  return (
    <AppearanceContext.Provider
      value={{ appearance: appearance ?? "system", setAppearance, saveError }}
    >
      {children}
    </AppearanceContext.Provider>
  )
}

export function useAppearance() {
  const context = useContext(AppearanceContext)
  if (!context) throw new Error("AppearanceProvider is missing.")
  return context
}
