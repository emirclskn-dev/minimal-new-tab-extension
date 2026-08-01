const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 18;

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean));
}

function responseHeaders(origin) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Accept, Content-Type";
    headers.Vary = "Origin";
  }
  return headers;
}

function json(body, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), ...extraHeaders }
  });
}

function photoPayload(photo) {
  const imageUrl = photo?.src?.landscape || photo?.src?.large2x || photo?.src?.large;
  const thumbnailUrl = photo?.src?.tiny || photo?.src?.small;
  if (!imageUrl || !thumbnailUrl || !photo?.photographer || !photo?.photographer_url || !photo?.url) return null;
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    alt: String(photo.alt || "Pexels arka plan görseli").slice(0, 180),
    thumbnailUrl,
    imageUrl,
    photographerName: String(photo.photographer).slice(0, 120),
    photographerUrl: photo.photographer_url,
    pexelsPhotoUrl: photo.url
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin")?.replace(/\/$/, "") || "";
    const originAllowed = origin && allowedOrigins(env).has(origin);
    const url = new URL(request.url);
    const extensionRequest = (!origin || origin === "null")
      && String(url.searchParams.get("client") || "") === String(env.EXTENSION_ID || "");
    const responseOrigin = originAllowed || origin === "null" ? origin : "";

    if (!originAllowed && !extensionRequest) return json({ error: "İstemci izinli değil." }, 403, "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(responseOrigin) });
    if (request.method !== "GET") return json({ error: "Yalnızca GET desteklenir." }, 405, responseOrigin, { Allow: "GET, OPTIONS" });

    if (url.pathname !== "/api/pexels/search") return json({ error: "Endpoint bulunamadı." }, 404, responseOrigin);

    const query = String(url.searchParams.get("query") || "").trim();
    if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
      return json({ error: "Arama 2–80 karakter olmalıdır." }, 400, responseOrigin);
    }
    if (!env.PEXELS_API_KEY) return json({ error: "Pexels servisi yapılandırılmamış." }, 503, responseOrigin);

    if (env.SEARCH_RATE_LIMITER) {
      const rateLimitKey = request.headers.get("CF-Connecting-IP") || url.searchParams.get("client") || "anonymous";
      const { success } = await env.SEARCH_RATE_LIMITER.limit({ key: rateLimitKey });
      if (!success) return json({ error: "Çok fazla arama yapıldı. Bir dakika sonra tekrar deneyin." }, 429, responseOrigin);
    }

    const requestedCount = Number.parseInt(url.searchParams.get("per_page") || "12", 10);
    const perPage = Number.isFinite(requestedCount) ? Math.min(Math.max(requestedCount, 1), MAX_RESULTS) : 12;
    const upstreamUrl = new URL(PEXELS_SEARCH_URL);
    upstreamUrl.searchParams.set("query", query);
    upstreamUrl.searchParams.set("orientation", "landscape");
    upstreamUrl.searchParams.set("page", "1");
    upstreamUrl.searchParams.set("per_page", String(perPage));

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { Authorization: env.PEXELS_API_KEY, Accept: "application/json" },
        signal: AbortSignal.timeout(8000)
      });
      if (upstream.status === 429) {
        const retryAfter = upstream.headers.get("Retry-After");
        return json(
          { error: "Pexels arama limiti doldu. Daha sonra tekrar deneyin." },
          429,
          responseOrigin,
          retryAfter ? { "Retry-After": retryAfter } : {}
        );
      }
      if (!upstream.ok) {
        console.error(JSON.stringify({ event: "pexels_upstream_error", status: upstream.status }));
        return json({ error: "Pexels araması tamamlanamadı." }, 502, responseOrigin);
      }

      const data = await upstream.json();
      const photos = Array.isArray(data.photos) ? data.photos.map(photoPayload).filter(Boolean) : [];
      return json({
        page: Number(data.page) || 1,
        perPage,
        totalResults: Number(data.total_results) || 0,
        photos
      }, 200, responseOrigin);
    } catch (error) {
      console.error(JSON.stringify({ event: "pexels_proxy_failure", name: error?.name || "Error" }));
      const timedOut = error?.name === "TimeoutError";
      return json({ error: timedOut ? "Pexels isteği zaman aşımına uğradı." : "Pexels servisine ulaşılamadı." }, 502, responseOrigin);
    }
  }
};
