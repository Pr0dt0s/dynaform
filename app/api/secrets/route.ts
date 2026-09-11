import { NextRequest, NextResponse } from "next/server";
import { createSecretRequest } from "@/lib/db";
import { ValidationError, validateEnvVarName, validatePin, validatePublicKey } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const envVarName = validateEnvVarName(body.envVarName);
    const publicKey = validatePublicKey(body.publicKey);
    const pin = validatePin(body.pin);
    const description = typeof body.description === "string" ? body.description : undefined;

    const { id, secret, expiresAt } = createSecretRequest({ envVarName, description, publicKey, pin });
    const origin = process.env.APP_ORIGIN || new URL(req.url).origin;
    return NextResponse.json({ id, secret, url: `${origin}/s/${id}?s=${secret}`, expiresAt });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
