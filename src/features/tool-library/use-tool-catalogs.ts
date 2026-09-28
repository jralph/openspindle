import { useQuery } from "@tanstack/react-query"
import {
  createInitialToolCatalogs,
  loadToolCatalogs,
} from "@/app/tools/tool-catalog-store"

export const toolCatalogKeys = { all: ["tool-catalogs"] as const }

/**
 * The packaged catalogs, fetched once per session. Catalogs already loaded (those of
 * the starter tools) are shown while the rest load; a partial failure is refetched on
 * retry or next open.
 */
export function useToolCatalogs() {
  const query = useQuery({
    queryKey: toolCatalogKeys.all,
    queryFn: loadToolCatalogs,
    staleTime: (current) => (current.state.data?.error ? 0 : Infinity),
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })
  return {
    catalogs: query.data?.catalogs ?? createInitialToolCatalogs(),
    loading: query.isFetching,
    error: query.data?.error ?? null,
    retry: () => void query.refetch(),
  }
}
