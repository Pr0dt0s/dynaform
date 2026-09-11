import { NextRequest, NextResponse } from "next/server";
import { resolveForm } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const secret = req.nextUrl.searchParams.get("s");
  if (!secret) return NextResponse.json({ status: "expired" });
  return NextResponse.json(resolveForm(id, secret));
}
