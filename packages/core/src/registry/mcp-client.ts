import { VerifiedCounterpartyError } from "../util/errors.js";
import { fetchWithTimeout, type FetchLike } from "../util/http.js";

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: { content?: { type: string; text?: string }[]; isError?: boolean };
}
interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string };
}

/**
 * Minimal, dependency-free MCP client for the stateless "streamable HTTP" transport.
 * Handles both `application/json` and `text/event-stream` responses, which is all the
 * hosted Concordium Agent Registry MCP server needs.
 */
export class McpClient {
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  /** Calls an MCP tool and returns its first text content parsed as JSON. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.fetchImpl,
        this.url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        },
        this.timeoutMs,
      );
    } catch (cause) {
      throw new VerifiedCounterpartyError(
        `MCP ${name}: registry unreachable`,
        "REGISTRY_UNAVAILABLE",
        {
          cause,
        },
      );
    }
    if (!res.ok) {
      throw new VerifiedCounterpartyError(
        `MCP ${name}: HTTP ${res.status}`,
        res.status >= 500 || res.status === 429 ? "REGISTRY_UNAVAILABLE" : "REGISTRY_PROTOCOL",
      );
    }
    const message = parseRpcBody(await res.text(), res.headers.get("content-type") ?? "");
    if ("error" in message) {
      throw new VerifiedCounterpartyError(
        `MCP ${name}: ${message.error.message}`,
        "REGISTRY_PROTOCOL",
      );
    }
    const text = message.result.content?.find((c) => c.type === "text")?.text;
    if (message.result.isError) {
      throw new VerifiedCounterpartyError(
        `MCP ${name}: ${text ?? "tool error"}`,
        "REGISTRY_PROTOCOL",
      );
    }
    if (text === undefined) {
      throw new VerifiedCounterpartyError(`MCP ${name}: empty tool result`, "REGISTRY_PROTOCOL");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}

function parseRpcBody(body: string, contentType: string): JsonRpcSuccess | JsonRpcFailure {
  let json = body;
  if (contentType.includes("text/event-stream")) {
    const data = body
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean)
      .at(-1);
    if (data === undefined) {
      throw new VerifiedCounterpartyError("MCP: empty event stream", "REGISTRY_PROTOCOL");
    }
    json = data;
  }
  try {
    return JSON.parse(json) as JsonRpcSuccess | JsonRpcFailure;
  } catch (cause) {
    throw new VerifiedCounterpartyError("MCP: malformed JSON-RPC response", "REGISTRY_PROTOCOL", {
      cause,
    });
  }
}
