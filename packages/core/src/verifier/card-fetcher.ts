import { sha256Hex } from "../util/crypto.js";
import { fetchWithTimeout, type FetchLike } from "../util/http.js";

export type CardFetch =
  | { readonly ok: true; readonly sha256: string; readonly json: unknown; readonly bytes: number }
  | { readonly ok: false; readonly error: string };

const MAX_CARD_BYTES = 256 * 1024;

/** Fetches an Agent Card and hashes the exact served bytes, as the badge spec requires. */
export async function fetchCard(
  url: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 8_000,
): Promise<CardFetch> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, error: "agent_uri is not a valid URL" };
  }
  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.hostname !== "localhost" &&
    parsedUrl.hostname !== "127.0.0.1"
  ) {
    return { ok: false, error: "agent_uri must use https" };
  }
  try {
    const res = await fetchWithTimeout(fetchImpl, url, { redirect: "error" }, timeoutMs);
    if (!res.ok) return { ok: false, error: `card URL returned HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_CARD_BYTES) return { ok: false, error: "card exceeds 256 KiB" };
    let json: unknown = null;
    try {
      json = JSON.parse(new TextDecoder().decode(buf)) as unknown;
    } catch {
      json = null;
    }
    return { ok: true, sha256: await sha256Hex(buf), json, bytes: buf.byteLength };
  } catch (e) {
    return { ok: false, error: `card fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
