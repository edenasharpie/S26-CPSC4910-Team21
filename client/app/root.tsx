import {
  Form,
  Link,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";
import { useEffect, useRef } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { TopNav } from "~/components";
import { getSession, isAssumedSession } from "~/utils/session.server";
import { toApiUrl } from "~/utils/api-url";

const ROLE_HOME_PATHS = {
  driver: "/driver/dashboard",
  sponsor: "/sponsor/dashboard",
  admin: "/admin/dashboard",
} as const;

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Grotesk:wght@400;500;600;700&display=swap",
  },
];

async function loadTopNavNotifications(request: Request, session: ReturnType<typeof getSession>) {
  if (!session) {
    return { items: [], unreadCount: 0 };
  }

  const role = String(session.UserType).toLowerCase();
  if (role !== "driver" && role !== "sponsor") {
    return { items: [], unreadCount: 0 };
  }

  const basePath =
    role === "driver"
      ? `/api/driver/${session.UserID}/notifications`
      : `/api/sponsors/${session.UserID}/notifications`;

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const requestInit = cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined;

  try {
    const res = await fetch(toApiUrl(`${basePath}?limit=20&offset=0`), requestInit);
    if (!res.ok) {
      return { items: [], unreadCount: 0 };
    }

    const payload = await res.json();
    const items = Array.isArray(payload?.notifications) ? payload.notifications : [];
    const unreadCount = Number(payload?.unreadCount ?? 0);

    return {
      items,
      unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
    };
  } catch {
    return { items: [], unreadCount: 0 };
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = getSession(request);
  const assumed = isAssumedSession(session);
  const topNavNotifications = await loadTopNavNotifications(request, session);

  return {
    session,
    assumed,
    originalRole: session?.OriginalUser?.UserType ?? null,
    topNavNotifications,
  };
}

function AssumptionTopBanner({
  session,
  originalRole,
}: {
  session: ReturnType<typeof getSession>;
  originalRole: "driver" | "sponsor" | "admin" | null;
}) {
  if (!session?.OriginalUser || !originalRole) {
    return null;
  }

  const roleAccent =
    originalRole === "admin"
      ? {
          shell: "border-red-200 bg-gradient-to-r from-red-50 via-amber-50 to-red-50 text-red-900 dark:border-red-800 dark:from-red-950/70 dark:via-red-900/40 dark:to-red-950/70 dark:text-red-100",
          note: "Administrative Assumed View",
          badge: "danger" as const,
        }
      : {
          shell: "border-cyan-200 bg-gradient-to-r from-cyan-50 via-sky-50 to-cyan-50 text-cyan-900 dark:border-cyan-800 dark:from-cyan-950/70 dark:via-cyan-900/40 dark:to-cyan-950/70 dark:text-cyan-100",
          note: "Sponsor Assumed View",
          badge: "info" as const,
        };

  return (
    <div className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/80 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/70">
      <div className="container-padding py-2">
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm ${roleAccent.shell}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Badge variant={roleAccent.badge} size="sm">
              {roleAccent.note}
            </Badge>
            <p className="truncate text-sm sm:text-base">
              Acting as <span className="font-semibold">{session.Username}</span> ({session.UserType})
              <span className="mx-2 text-gray-400 dark:text-gray-500">•</span>
              Original user: <span className="font-semibold">{session.OriginalUser.Username}</span> ({session.OriginalUser.UserType})
            </p>
          </div>
          <Form method="post" action="/exit-assumption">
            <Button type="submit" size="sm" variant="secondary" className="border border-black/10 dark:border-white/20">
              Exit Assumed View
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { session, assumed, originalRole, topNavNotifications } = useLoaderData<typeof loader>();
  const autoExitTriggeredRef = useRef(false);
  const dashboardHref = session
    ? ROLE_HOME_PATHS[session.UserType as keyof typeof ROLE_HOME_PATHS] ?? "/"
    : undefined;

  useEffect(() => {
    if (!assumed || typeof window === "undefined") {
      autoExitTriggeredRef.current = false;
      return;
    }

    autoExitTriggeredRef.current = false;

    const triggerAutoExit = () => {
      if (autoExitTriggeredRef.current) {
        return;
      }

      autoExitTriggeredRef.current = true;

      try {
        void fetch("/exit-assumption?mode=unload", {
          method: "POST",
          keepalive: true,
          credentials: "same-origin",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
          },
          body: "mode=unload",
        });
      } catch {
        // Fail silently to avoid blocking browser navigation or tab close.
      }
    };

    window.addEventListener("pagehide", triggerAutoExit);
    window.addEventListener("beforeunload", triggerAutoExit);

    return () => {
      window.removeEventListener("pagehide", triggerAutoExit);
      window.removeEventListener("beforeunload", triggerAutoExit);
    };
  }, [assumed]);

  return (
    <>
      {assumed ? (
        <AssumptionTopBanner session={session} originalRole={originalRole} />
      ) : null}
      <TopNav
        user={
          session
            ? {
                username: session.Username,
                role: session.UserType,
                firstName: session.FirstName,
                lastName: session.LastName,
                userId: session.UserID,
              }
            : null
        }
        dashboardHref={dashboardHref}
        notifications={topNavNotifications?.items ?? []}
        unreadNotificationCount={Number(topNavNotifications?.unreadCount ?? 0)}
      />
      <Outlet />
      <footer className="border-t border-gray-200 bg-white/90 py-6 dark:border-gray-800 dark:bg-gray-950/90">
        <div className="container-padding">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-gray-600 dark:text-gray-300">© 2026 FleetScore</p>
            <div className="flex items-center gap-3">
              <Link to="/features" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
                Features
              </Link>
              <Link to="/about" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
                About
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
