const ORIGIN = "https://alalei0921.github.io";
const BUCKET = "lw5-dog-calendar-v1-private";
const DIR = "revisions";
const MAX_STATE = 1024 * 1024;
const KEY_HASHES = ["__LW5_DIGEST_1__", "__LW5_DIGEST_2__"];
const utf8 = new TextEncoder();
const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

class ClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function reply(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function authorized(value: unknown): Promise<boolean> {
  if (typeof value !== "string" || value.length > 128) return false;
  const bytes = utf8.encode(value);
  if (bytes.length < 32 || bytes.length > 128) return false;
  if (!KEY_HASHES.every(x => /^[a-f0-9]{64}$/.test(x)) || KEY_HASHES[0] === KEY_HASHES[1]) {
    throw new Error("Calendar unavailable");
  }
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let matched = 0;
  for (const expected of KEY_HASHES) {
    let difference = 0;
    for (let i = 0; i < hash.length; i++) {
      difference |= hash[i] ^ parseInt(expected.slice(i * 2, i * 2 + 2), 16);
    }
    matched |= Number(difference === 0);
  }
  return matched !== 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const limit = MAX_STATE + 8192;
  if (Number(request.headers.get("content-length")) > limit) throw new ClientError(413, "22023");
  const reader = request.body?.getReader();
  if (!reader) throw new ClientError(400, "22023");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ClientError(413, "22023");
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    const value: unknown = JSON.parse(body + decoder.decode());
    if (!isObject(value)) throw new Error("Invalid body");
    return value;
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError(400, "22023");
  } finally {
    reader.releaseLock();
  }
}

// Only fixed paths below the project's Storage API receive a service credential.
function storage(path: string, method = "GET", data?: unknown): Promise<Response> {
  const base = new URL(Deno.env.get("SUPABASE_URL") || "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || base.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) ||
    base.port || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Calendar unavailable");
  }
  const headers: Record<string, string> = { Authorization: "Bearer " + key, apikey: key };
  if (data !== undefined) headers["Content-Type"] = "application/json";
  if (method === "POST" && path.startsWith("/object/" + BUCKET + "/")) headers["x-upsert"] = "false";
  return fetch(base.origin + "/storage/v1" + path, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data),
    redirect: "error", cache: "no-store",
  });
}

async function errorKind(response: Response): Promise<"missing" | "duplicate" | "other"> {
  const info = await response.json().catch(() => ({}));
  const code = String(info.code || info.error || "").toLowerCase();
  const message = String(info.message || "").toLowerCase();
  if (response.status === 404 || String(info.statusCode) === "404" ||
      ["nosuchkey", "nosuchbucket", "not_found", "notfound"].includes(code) ||
      ["bucket not found", "object not found"].includes(message)) return "missing";
  if (response.status === 409 || String(info.statusCode) === "409" ||
      ["keyalreadyexists", "duplicate", "resourcealreadyexists"].includes(code) ||
      message.includes("already exists")) return "duplicate";
  return "other";
}

async function ensurePrivate(): Promise<void> {
  const path = "/bucket/" + BUCKET;
  let found = await storage(path);
  if (!found.ok) {
    if (await errorKind(found) !== "missing") throw new Error("Calendar unavailable");
    const created = await storage("/bucket", "POST", { id: BUCKET, name: BUCKET, public: false });
    if (!created.ok && await errorKind(created) !== "duplicate") throw new Error("Calendar unavailable");
    if (created.ok) await created.body?.cancel();
    found = await storage(path);
  }
  if (!found.ok) throw new Error("Calendar unavailable");
  const bucket = await found.json();
  if (bucket.id !== BUCKET || bucket.public !== false) throw new Error("Calendar unavailable");
}

type Snapshot = { revision: number; state: Record<string, unknown> | null };
function revisionOf(name: string): number {
  return /^r[0-9]{10}\.json$/.test(name) ? Number(name.slice(1, 11)) : 0;
}
function fileOf(revision: number): string {
  return "r" + String(revision).padStart(10, "0") + ".json";
}

async function listLatest(limit: number, directory = DIR): Promise<string[]> {
  const response = await storage("/object/list/" + BUCKET, "POST", {
    prefix: directory + "/", sortBy: { column: "name", order: "desc" }, limit, offset: 0,
  });
  if (!response.ok) throw new Error("Calendar unavailable");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Calendar unavailable");
  // Fail closed if anything unexpected appears in this dedicated namespace.
  return rows.map(row => {
    if (typeof row.name !== "string" || !revisionOf(row.name)) throw new Error("Calendar unavailable");
    return row.name;
  });
}

async function latest(directory = DIR): Promise<Snapshot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [name] = await listLatest(1, directory);
    if (!name) return { revision: 0, state: null };
    const response = await storage("/object/authenticated/" + BUCKET + "/" + directory + "/" + name);
    if (!response.ok) {
      if (await errorKind(response) === "missing") continue;
      throw new Error("Calendar unavailable");
    }
    const state: unknown = await response.json();
    if (!isObject(state)) throw new Error("Calendar unavailable");
    return { revision: revisionOf(name), state };
  }
  throw new Error("Calendar unavailable");
}

async function prune(confirmed: number, directory = DIR, keep = 2): Promise<void> {
  if (confirmed <= keep) return;
  const names = await listLatest(32, directory);
  const old = names.slice(keep).filter(name => revisionOf(name) <= confirmed - keep);
  if (!old.length) return;
  const result = await storage("/object/" + BUCKET, "DELETE", { prefixes: old.map(n => directory + "/" + n) });
  await result.body?.cancel();
}

type FlowAmount = "light" | "medium" | "heavy" | null;

function isAmount(value: unknown): value is FlowAmount {
  return value === null || value === "light" || value === "medium" || value === "heavy";
}

function flowDate(value: unknown, offsetMinutes: unknown = 480): string {
  // The existing calendar uses local civil dates. The offset allows the same
  // selected date to work across phones and time zones at midnight.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" ||
      typeof offsetMinutes !== "number" || !Number.isInteger(offsetMinutes) ||
      offsetMinutes < -720 || offsetMinutes > 840) throw new ClientError(400, "22023");
  const parsed = new Date(value + "T00:00:00Z");
  const today = new Date(Date.now() + offsetMinutes * 60_000).toISOString().slice(0, 10);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > today) {
    throw new ClientError(400, "22023");
  }
  return value;
}

async function flowSnapshot(date: string, directory: string) {
  const { revision, state } = await latest(directory);
  if (state === null && revision === 0) return { date, revision, flow: null };
  if (!state || !isAmount(state.flow)) throw new Error("Calendar unavailable");
  return { date, revision, flow: state.flow };
}

async function handleFlow(data: Record<string, unknown>, write: boolean): Promise<Response> {
  const date = flowDate(data.p_date, data.p_offset_minutes);
  const value = data.p_flow, expected = data.p_revision;
  if (write && (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0 ||
      expected >= 2147483647 || !isAmount(value))) throw new ClientError(400, "22023");
  // Legacy callers can only read and write files under revisions/. A separate
  // stream per date keeps both old snapshots and simultaneous other-day edits intact.
  const directory = "flow-days/" + date;
  await ensurePrivate();
  const current = await flowSnapshot(date, directory);
  if (!write) return reply(200, current);
  if (current.revision !== expected) return reply(200, { ok: false, ...current });
  if (current.flow === value) return reply(200, { ok: true, ...current });
  const next = current.revision + 1;
  const created = await storage("/object/" + BUCKET + "/" + directory + "/" + fileOf(next), "POST", { flow: value });
  if (!created.ok) {
    if (await errorKind(created) !== "duplicate") throw new Error("Calendar unavailable");
    return reply(200, { ok: false, ...await flowSnapshot(date, directory) });
  }
  await created.body?.cancel();
  // Verify the stored value, including when a delayed request recreates an
  // old object after pruning. A clear retains a null revision to prevent ABA.
  const saved = await flowSnapshot(date, directory);
  if (saved.revision !== next || saved.flow !== value) return reply(200, { ok: false, ...saved });
  await prune(next, directory, 1).catch(() => {});
  return reply(200, { ok: true, ...saved });
}

Deno.serve(async request => {
  try {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== ORIGIN) return reply(403, { code: "42501" });
    const route = new URL(request.url).pathname.match(/^(?:\/functions\/v1)?\/lw5-dog-calendar\/(lw5_dog_read|lw5_dog_save|lw5_dog_flow_read|lw5_dog_flow_save)\/?$/);
    if (!route) return reply(404, { code: "not_found" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { code: "method_not_allowed" });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply(415, { code: "invalid_content_type" });
    }
    const data = await requestBody(request);
    if (!await authorized(data.p_key)) return reply(401, { code: "42501" });
    if (route[1] === "lw5_dog_flow_read" || route[1] === "lw5_dog_flow_save") {
      return await handleFlow(data, route[1] === "lw5_dog_flow_save");
    }
    const write = route[1] === "lw5_dog_save";
    const revision = data.p_revision, state = data.p_state;
    if (write && (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 ||
      revision >= 2147483647 || !isObject(state) || utf8.encode(JSON.stringify(state)).length > MAX_STATE)) {
      return reply(400, { code: "22023" });
    }
    await ensurePrivate();
    const current = await latest();
    if (!write) return reply(200, current);
    if (current.revision !== revision) return reply(200, { ok: false, ...current });
    // A second writer for the same revision hits Storage's unique object key.
    const next = current.revision + 1;
    const created = await storage("/object/" + BUCKET + "/" + DIR + "/" + fileOf(next), "POST", state);
    if (!created.ok) {
      if (await errorKind(created) !== "duplicate") throw new Error("Calendar unavailable");
      return reply(200, { ok: false, ...await latest() });
    }
    await created.body?.cancel();
    // A delayed create can arrive after a newer version has pruned its object name.
    // Only acknowledge this snapshot while it is still the newest revision.
    const [head] = await listLatest(1);
    if (head !== fileOf(next)) return reply(200, { ok: false, ...await latest() });
    await prune(next).catch(() => {});
    return reply(200, { ok: true, revision: next, state });
  } catch (error) {
    if (error instanceof ClientError) return reply(error.status, { code: error.code });
    return reply(503, { code: "calendar_unavailable" });
  }
});
