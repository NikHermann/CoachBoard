// Im freigegebenen Release ausschließlich auf den unten festgelegten HTTPS-Domains aktiv.
// URL-Parameter, localhost und fremde Hosts können diesen Modus nicht einschalten.
export const PRODUCTION_AUTH_ENABLED = true;

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
