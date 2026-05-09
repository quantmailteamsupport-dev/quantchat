import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const BASIC_REALM = "Nexus Admin";

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_REALM}", charset="UTF-8"`,
    },
  });
}

function parseBasicAuth(authHeader: string | null): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith("Basic ")) return null;
  const encoded = authHeader.slice("Basic ".length);

  try {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const adminSecret = process.env.ADMIN_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!adminSecret) {
    if (isProduction) {
      return new NextResponse("ADMIN_SECRET is required in production.", { status: 503 });
    }
    return NextResponse.next();
  }

  const parsed = parseBasicAuth(req.headers.get("authorization"));
  if (!parsed || parsed.password !== adminSecret) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
