/**
 * Server-side DeerFlow client.
 *
 * DeerFlow's gateway requires (a) a JWT in the `access_token` cookie and
 * (b) double-submit CSRF (`csrf_token` cookie + matching `X-CSRF-Token`
 * header) on every state-changing request. We log in once with a
 * dedicated bot account and cache the resulting cookies + CSRF token
 * in module memory, refreshing on expiry or 401.
 */

export const DEERFLOW_BASE_URL =
  process.env.DEERFLOW_BASE_URL ?? "http://localhost:8001";

interface Session {
  cookieHeader: string;
  csrfToken: string;
  expiresAt: number;
}

let session: Session | null = null;
let inflightLogin: Promise<Session> | null = null;

function parseSetCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  // Node 19.7+ exposes getSetCookie(); fall back to single Set-Cookie header
  const list =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  for (const sc of list) {
    const firstPart = sc.split(";")[0];
    const eq = firstPart.indexOf("=");
    if (eq < 0) continue;
    const k = firstPart.slice(0, eq).trim();
    const v = firstPart.slice(eq + 1).trim();
    out[k] = v;
  }
  return out;
}

async function login(): Promise<Session> {
  const email = process.env.DEERFLOW_ADMIN_EMAIL;
  const password = process.env.DEERFLOW_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "DEERFLOW_ADMIN_EMAIL / DEERFLOW_ADMIN_PASSWORD not configured",
    );
  }

  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${DEERFLOW_BASE_URL}/api/v1/auth/login/local`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeerFlow login failed: ${res.status} ${text}`);
  }

  const cookies = parseSetCookies(res);
  const accessToken = cookies["access_token"];
  const csrfToken = cookies["csrf_token"];
  if (!accessToken || !csrfToken) {
    throw new Error("DeerFlow login missing access_token or csrf_token cookie");
  }

  const json = (await res.json()) as { expires_in?: number };
  const ttlMs = (json.expires_in ?? 604800) * 1000;
  const sess: Session = {
    cookieHeader: `access_token=${accessToken}; csrf_token=${csrfToken}`,
    csrfToken,
    expiresAt: Date.now() + ttlMs - 60_000, // 1 min safety buffer
  };
  session = sess;
  return sess;
}

async function getSession(): Promise<Session> {
  if (session && Date.now() < session.expiresAt) return session;
  if (inflightLogin) return inflightLogin;
  inflightLogin = login().finally(() => {
    inflightLogin = null;
  });
  return inflightLogin;
}

/**
 * Fetch a DeerFlow non-agentic exec endpoint authenticated by the shared
 * VEPIP_INTERNAL_SECRET bearer token. These endpoints are exempted from
 * DeerFlow's AuthMiddleware/CSRFMiddleware and live under /api/exec/*.
 */
export class DeerflowUnreachableError extends Error {
  constructor(public readonly cause: unknown) {
    super(
      `Cannot reach DeerFlow at ${DEERFLOW_BASE_URL}. Start it with \`make dev\` in the deer-flow directory (or set DEERFLOW_BASE_URL if it's hosted elsewhere).`,
    );
    this.name = "DeerflowUnreachableError";
  }
}

function isConnectionRefused(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string; errors?: Array<{ code?: string }> } };
  if (e.code === "ECONNREFUSED") return true;
  if (e.cause?.code === "ECONNREFUSED") return true;
  if (e.cause?.errors?.some((er) => er.code === "ECONNREFUSED")) return true;
  return false;
}

export async function deerflowExecFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const secret = process.env.VEPIP_INTERNAL_SECRET;
  if (!secret) {
    throw new Error("VEPIP_INTERNAL_SECRET not configured");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  try {
    return await fetch(`${DEERFLOW_BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    if (isConnectionRefused(err)) throw new DeerflowUnreachableError(err);
    throw err;
  }
}

/**
 * Fetch a DeerFlow gateway endpoint with auth + CSRF attached.
 * On 401 we drop the cached session and retry once.
 */
export async function deerflowFetch(
  path: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<Response> {
  const sess = await getSession();
  const headers = new Headers(init.headers);
  headers.set("Cookie", sess.cookieHeader);
  headers.set("X-CSRF-Token", sess.csrfToken);

  const res = await fetch(`${DEERFLOW_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retryOn401) {
    session = null;
    return deerflowFetch(path, init, false);
  }
  return res;
}
