const DEFAULTS = {
  owner: "masakasakasama",
  repo: "Trip_Plan",
  branch: "main",
  path: "trip-plan.json",
  allowedOrigin: "https://masakasakasama.github.io"
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || DEFAULTS.allowedOrigin;
  return {
    "Access-Control-Allow-Origin": origin === allowed ? origin : allowed,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-Match",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, init = {}, request, env) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
      ...(init.headers || {})
    }
  });
}

function config(env) {
  return {
    owner: env.GITHUB_OWNER || DEFAULTS.owner,
    repo: env.GITHUB_REPO || DEFAULTS.repo,
    branch: env.GITHUB_BRANCH || DEFAULTS.branch,
    path: env.STATE_PATH || DEFAULTS.path
  };
}

function contentUrl(env) {
  const cfg = config(env);
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
}

function decodeBase64(value) {
  return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, "")), (char) => char.charCodeAt(0)));
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function githubFetch(env, url, init = {}) {
  if (!env.GITHUB_TOKEN) {
    return new Response("GITHUB_TOKEN is not set", { status: 500 });
  }
  return fetch(url, {
    ...init,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "trip-plan-sync-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {})
    }
  });
}

function validatePublicTripData(value) {
  if (!value || typeof value !== "object") return "invalid body";
  const isSydneySchema = value.meta && Array.isArray(value.events) && Array.isArray(value.flights) && Array.isArray(value.checklist);
  const isLegacySchema = Array.isArray(value.trips);
  if (!isSydneySchema && !isLegacySchema) {
    return "invalid trip schema";
  }
  const text = JSON.stringify(value);
  const banned = [
    /github_pat_/i,
    /予約番号/,
    /確認番号/,
    /Expedia/i,
    /ETA番号/,
    /パスポート番号/,
    /電話番号/,
    /メールアドレス/,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /\b\d{10,}\b/
  ];
  return banned.some((pattern) => pattern.test(text)) ? "private data detected" : "";
}

async function readState(request, env) {
  const cfg = config(env);
  const response = await githubFetch(env, `${contentUrl(env)}?ref=${cfg.branch}&t=${Date.now()}`);
  if (!response.ok) {
    return json({ error: "read_failed", status: response.status }, { status: response.status }, request, env);
  }
  const payload = await response.json();
  return json(JSON.parse(decodeBase64(payload.content)), {
    headers: { "ETag": payload.sha, "X-Trip-Sha": payload.sha }
  }, request, env);
}

async function writeState(request, env) {
  const cfg = config(env);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 }, request, env);
  }
  const validationError = validatePublicTripData(body);
  if (validationError) return json({ error: validationError }, { status: 400 }, request, env);

  const latest = await githubFetch(env, `${contentUrl(env)}?ref=${cfg.branch}&t=${Date.now()}`);
  if (!latest.ok) {
    return json({ error: "sha_read_failed", status: latest.status }, { status: latest.status }, request, env);
  }
  const current = await latest.json();
  const content = `${JSON.stringify(body, null, 2)}\n`;
  const response = await githubFetch(env, contentUrl(env), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Update Sydney trip plan ${new Date().toISOString()}`,
      content: encodeBase64(content),
      sha: current.sha,
      branch: cfg.branch
    })
  });
  if (!response.ok) {
    return json({ error: "write_failed", status: response.status }, { status: response.status }, request, env);
  }
  const payload = await response.json();
  return json({ ok: true, sha: payload.content.sha }, {
    headers: { "ETag": payload.content.sha, "X-Trip-Sha": payload.content.sha }
  }, request, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true }, {}, request, env);
    if (url.pathname !== "/state") return json({ error: "not_found" }, { status: 404 }, request, env);
    if (request.method === "GET") return readState(request, env);
    if (request.method === "PUT") return writeState(request, env);
    return json({ error: "method_not_allowed" }, { status: 405 }, request, env);
  }
};
