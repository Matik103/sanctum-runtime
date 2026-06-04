import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

function reportServerError(label: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[site:${label}]`, error);
    return;
  }

  if (error instanceof Error) {
    const firstStackLine = error.stack?.split("\n").slice(0, 3).join(" | ");
    console.error(
      `[site:${label}] ${error.name}: ${error.message}${firstStackLine ? ` | ${firstStackLine}` : ""}`,
    );
    return;
  }

  console.error(`[site:${label}] request failed: ${String(error)}`);
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    reportServerError("middleware", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
