import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_BASE = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
  /\/+$/,
  ""
);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxyToBackend(req: NextRequest, path: string[]): Promise<NextResponse> {
  const joinedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const upstreamUrl = `${UPSTREAM_BASE}/${joinedPath}${req.nextUrl.search}`;

  const forwardedHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      forwardedHeaders.set(key, value);
    }
  });

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: forwardedHeaders,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new NextResponse(await upstreamResponse.arrayBuffer(), {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { detail: "Backend service is unavailable" },
      { status: 502 }
    );
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToBackend(req, path);
}
