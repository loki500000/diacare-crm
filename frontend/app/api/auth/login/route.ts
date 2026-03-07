import { NextRequest, NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  const body = await req.json();

  let data: { ok: boolean; role: string | null; clinic_name: string | null; doctor_name: string | null };
  try {
    const res = await fetch(`${API}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Backend unreachable" }, { status: 503 });
  }

  if (!data.ok) {
    return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  // Build a simple token: base64(JSON) — httpOnly so client can't tamper
  const payload = {
    role: data.role,
    clinic_name: data.clinic_name,
    doctor_name: data.doctor_name,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  };
  const token = Buffer.from(JSON.stringify(payload)).toString("base64");

  const response = NextResponse.json({
    ok: true,
    role: data.role,
    clinic_name: data.clinic_name,
    doctor_name: data.doctor_name,
  });
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
