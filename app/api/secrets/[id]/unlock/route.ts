import { NextRequest, NextResponse } from "next/server";
import { unlockSecret } from "@/lib/db";
import { unlockCookieName } from "@/lib/unlock-cookie";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = req.nextUrl.searchParams.get("s");
  if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!pin) return NextResponse.json({ error: "pin is required" }, { status: 400 });

  const result = unlockSecret(id, secret, pin);
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      case "no_pin_required":
        return NextResponse.json({ ok: true });
      case "burned":
        return NextResponse.json({ error: "too_many_attempts" }, { status: 410 });
      case "wrong_pin":
        return NextResponse.json({ error: "wrong_pin", attemptsRemaining: result.attemptsRemaining }, { status: 401 });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(unlockCookieName(id), result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });
  return res;
}
