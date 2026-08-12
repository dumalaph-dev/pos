import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const normalized = error instanceof Error ? error : new Error(String(error));

  // Vercel captures structured stderr, so server errors remain visible in the
  // deployment's runtime logs without a paid third-party error service.
  console.error(JSON.stringify({
    event: "server_request_error",
    message: normalized.message,
    digest: "digest" in normalized ? String(normalized.digest) : undefined,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  }));
};
