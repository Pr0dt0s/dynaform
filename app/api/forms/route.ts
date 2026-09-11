import { NextRequest, NextResponse } from "next/server";
import { createForm } from "@/lib/db";
import { ValidationError, validateFields, validatePin, validatePublicKey } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.title !== "string" || body.title.length === 0) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const fields = validateFields(body.fields);
    const publicKey = validatePublicKey(body.publicKey);
    const pin = validatePin(body.pin);
    const description = typeof body.description === "string" ? body.description : undefined;

    const { id, secret, expiresAt } = createForm({ title: body.title, description, fields, publicKey, pin });
    const origin = process.env.APP_ORIGIN || new URL(req.url).origin;
    return NextResponse.json({ id, secret, url: `${origin}/f/${id}?s=${secret}`, expiresAt });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
