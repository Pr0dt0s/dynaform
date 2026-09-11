import { NextRequest, NextResponse } from "next/server";
import { getSecretForRender } from "@/lib/db";
import { unlockCookieName } from "@/lib/unlock-cookie";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = req.nextUrl.searchParams.get("s");
  if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const unlockToken = req.cookies.get(unlockCookieName(id))?.value ?? null;
  const result = getSecretForRender(id, secret, unlockToken);
  if (!result.ok) {
    if (result.reason === "locked") return NextResponse.json({ error: "locked" }, { status: 401 });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    envVarName: result.envVarName,
    description: result.description,
    publicKey: result.publicKey,
    status: result.status,
  });
}
