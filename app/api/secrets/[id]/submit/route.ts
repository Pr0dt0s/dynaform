import { NextRequest, NextResponse } from "next/server";
import { submitSecret } from "@/lib/db";
import { unlockCookieName } from "@/lib/unlock-cookie";
import { ValidationError, validateEncryptedPayload } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = req.nextUrl.searchParams.get("s");
  if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const unlockToken = req.cookies.get(unlockCookieName(id))?.value ?? null;
  try {
    const payload = validateEncryptedPayload(await req.json());
    const ok = submitSecret(id, secret, unlockToken, payload);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ status: "submitted" });
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
