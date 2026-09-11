import { NextRequest, NextResponse } from "next/server";
import { resolveSecret } from "@/lib/db";
import { parseTimeout } from "@/lib/validate";
import { waitFor } from "@/lib/wait";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = req.nextUrl.searchParams.get("s");
  if (!secret) return NextResponse.json({ status: "expired" });
  const timeout = parseTimeout(req.nextUrl.searchParams.get("timeout"));
  const result = await waitFor(() => resolveSecret(id, secret), timeout);
  return NextResponse.json(result);
}
