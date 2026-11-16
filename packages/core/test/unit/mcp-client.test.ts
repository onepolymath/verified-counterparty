import { describe, expect, it } from "vitest";
import { McpClient } from "../../src/registry/mcp-client.js";
import { VerifiedCounterpartyError } from "../../src/util/errors.js";
import type { FetchLike } from "../../src/util/http.js";

const rpc = (result: unknown) => JSON.stringify({ jsonrpc: "2.0", id: 1, result });
const text = (t: string, isError = false) => rpc({ content: [{ type: "text", text: t }], isError });

function respond(
  body: string,
  init: ResponseInit = {},
): FetchLike & { last?: RequestInit | undefined } {
  const f = ((_url: string | URL, req?: RequestInit) => {
    f.last = req;
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" }, ...init }),
    );
  }) as FetchLike & { last?: RequestInit | undefined };
  return f;
}

describe("McpClient", () => {
  it("sends a JSON-RPC tools/call and parses JSON text content", async () => {
    const f = respond(text('{"ok":true}'));
    const out = await new McpClient("https://mcp.test/mcp", f).callTool("check_badge", { id: "x" });
    expect(out).toEqual({ ok: true });
    expect(JSON.parse(String(f.last?.body))).toMatchObject({
      method: "tools/call",
      params: { name: "check_badge", arguments: { id: "x" } },
    });
  });

  it("parses event-stream responses", async () => {
    const f = respond(`event: message\ndata: ${text("[1,2]")}\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
    expect(await new McpClient("u", f).callTool("t", {})).toEqual([1, 2]);
  });

  it("returns non-JSON text verbatim", async () => {
    expect(await new McpClient("u", respond(text("hello"))).callTool("t", {})).toBe("hello");
  });

  it.each([
    [
      "JSON-RPC error",
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "boom" } }),
      /boom/,
    ],
    ["tool error", text("bad input", true), /bad input/],
    ["empty content", rpc({ content: [] }), /empty tool result/],
    ["malformed body", "<html>", /malformed/],
  ])("raises REGISTRY_PROTOCOL on %s", async (_name, body, msg) => {
    const err = await new McpClient("u", respond(body)).callTool("t", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerifiedCounterpartyError);
    expect((err as VerifiedCounterpartyError).code).toBe("REGISTRY_PROTOCOL");
    expect((err as Error).message).toMatch(msg);
  });

  it("raises on an empty event stream", async () => {
    const f = respond("event: ping\n\n", { headers: { "content-type": "text/event-stream" } });
    await expect(new McpClient("u", f).callTool("t", {})).rejects.toThrow(/empty event stream/);
  });

  it("maps 5xx and 429 to REGISTRY_UNAVAILABLE and 4xx to REGISTRY_PROTOCOL", async () => {
    for (const [status, code] of [
      [503, "REGISTRY_UNAVAILABLE"],
      [429, "REGISTRY_UNAVAILABLE"],
      [400, "REGISTRY_PROTOCOL"],
    ] as const) {
      const err = (await new McpClient("u", respond("", { status }))
        .callTool("t", {})
        .catch((e: unknown) => e)) as VerifiedCounterpartyError;
      expect(err.code).toBe(code);
    }
  });

  it("maps network failures to REGISTRY_UNAVAILABLE", async () => {
    const f: FetchLike = () => Promise.reject(new TypeError("fetch failed"));
    await expect(new McpClient("u", f).callTool("t", {})).rejects.toMatchObject({
      code: "REGISTRY_UNAVAILABLE",
    });
  });

  it("aborts slow registries", async () => {
    const f: FetchLike = (_u, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    await expect(new McpClient("u", f, 20).callTool("t", {})).rejects.toMatchObject({
      code: "REGISTRY_UNAVAILABLE",
    });
  });
});
