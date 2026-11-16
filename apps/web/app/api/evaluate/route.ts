import { evaluate, EvaluateRequest } from "@/lib/evaluate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = EvaluateRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid request" },
      { status: 400 },
    );
  }
  try {
    return Response.json(await evaluate(parsed.data), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "evaluation failed" },
      { status: 502 },
    );
  }
}
