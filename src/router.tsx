import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // "never" keeps trailing-slash behaviour consistent with vercel.json
    // (trailingSlash: false). "always" caused a redirect loop: TanStack added
    // a trailing slash; Vercel's edge immediately stripped it → Google saw an
    // infinite redirect chain and reported all blog URLs as "Redirect error".
    trailingSlash: "never",
  });

  return router;
};
