const LOCAL_API_FALLBACK = "http://localhost:5001";

function getEnvApiUrl(): string | undefined {
  if (typeof process !== "undefined" && process.env?.API_URL) {
    return process.env.API_URL;
  }

  const viteApiUrl =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL
      : undefined;

  return viteApiUrl || undefined;
}

export function getApiBaseUrl(): string {
  const configuredApiUrl = getEnvApiUrl();
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (typeof window !== "undefined") {
    const isLocalBrowser =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    return isLocalBrowser ? LOCAL_API_FALLBACK : "";
  }

  return LOCAL_API_FALLBACK;
}

export function toApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
