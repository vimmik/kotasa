import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile, landingPath } from "@/lib/auth";

// "Take me to my place": Me or the group's Home (landingPath). Logins, "/" and Google sign-in
// without a ?next= come here, so the choice lives in one spot.
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  const path = profile ? await landingPath(profile) : "/login";
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
