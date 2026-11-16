// Bewusste Release-Sperre: Eine URL kann den produktiven Auth-Modus nicht aktivieren.
// Erst in einem gesondert freigegebenen Release auf true setzen.
export const PRODUCTION_AUTH_ENABLED = false;

const PRODUCTION_HOSTS = new Set([
  "tsv-trainingsplatz.at",
  "www.tsv-trainingsplatz.at"
]);

export function resolveProductionAuthMode(
  locationLike = globalThis.location,
  enabled = PRODUCTION_AUTH_ENABLED
) {
  if (!enabled || !locationLike) return false;

  return locationLike.protocol === "https:"
    && PRODUCTION_HOSTS.has(String(locationLike.hostname || "").toLowerCase());
}

export const isProductionAuthMode = resolveProductionAuthMode();
