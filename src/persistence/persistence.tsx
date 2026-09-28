import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { useSelector } from "@tanstack/react-store"
import type { StoragePort } from "@/platform/host"
import { PersistedDocument } from "./document"
import type { DocumentState } from "./document"
import { fixtureRepository } from "./fixture-document"
import { libraryRepository } from "./library-document"

/**
 * Every persisted document of the app, loaded once at startup: the tool and stock libraries
 * and the fixture library. A project is not one: the app starts with a new project, and
 * projects are saved as files.
 */
export type Persistence = ReturnType<typeof createPersistence>

export function createPersistence(storage: StoragePort) {
  const documents = {
    library: new PersistedDocument(libraryRepository(storage)),
    fixtures: new PersistedDocument(fixtureRepository(storage)),
  }
  const all = Object.values(documents)
  for (const document of all) void document.load()
  // Pending debounced saves are written before the page goes away.
  window.addEventListener("pagehide", () => {
    for (const document of all) void document.flush()
  })
  return { ...documents, all }
}

const PersistenceContext = createContext<Persistence | null>(null)

export function PersistenceProvider({
  persistence,
  children,
}: {
  persistence: Persistence
  children: ReactNode
}) {
  return (
    <PersistenceContext.Provider value={persistence}>
      {children}
    </PersistenceContext.Provider>
  )
}

export function usePersistence(): Persistence {
  const persistence = useContext(PersistenceContext)
  if (!persistence) throw new Error("PersistenceProvider is missing.")
  return persistence
}

export function useDocumentState<TValue>(
  document: PersistedDocument<TValue>
): DocumentState<TValue> {
  return useSelector(document.state)
}
