import { Form, Link, useNavigate } from "react-router";

type NavRole = "driver" | "sponsor" | "admin";

interface TopNavProps {
  user:
    | {
        username: string;
        role: NavRole;
        firstName?: string;
        lastName?: string;
        userId?: number | string;
      }
    | null;
  dashboardHref?: string;
}

const NAV_SHELL_BY_ROLE: Record<"guest" | NavRole, string> = {
  guest:
    "bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 border-amber-200 text-amber-900 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-amber-900/40 dark:border-amber-700 dark:text-amber-100",
  driver:
    "bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-emerald-200 text-emerald-900 dark:from-emerald-900/40 dark:via-teal-900/30 dark:to-emerald-900/40 dark:border-emerald-700 dark:text-emerald-100",
  sponsor:
    "bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-100 border-sky-200 text-sky-900 dark:from-sky-900/40 dark:via-cyan-900/30 dark:to-sky-900/40 dark:border-sky-700 dark:text-sky-100",
  admin:
    "bg-gradient-to-r from-rose-50 via-red-50 to-rose-100 border-rose-200 text-rose-900 dark:from-rose-900/40 dark:via-red-900/30 dark:to-rose-900/40 dark:border-rose-700 dark:text-rose-100",
};

export function TopNav({ user, dashboardHref }: TopNavProps) {
  const navigate = useNavigate();
  const role = user?.role ?? "guest";
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.trim() ||
    (user?.username?.[0]?.toUpperCase() ?? "U");

  return (
    <header className={`border-b ${NAV_SHELL_BY_ROLE[role]}`}>
      <div className="container-padding py-3">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-black tracking-tight text-current hover:opacity-80"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4 8.5L12 4L20 8.5V15.5L12 20L4 15.5V8.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 12H16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M9.5 15H14.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              FleetScore
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Link
              to="/features"
              className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
            >
              Features
            </Link>
            <Link
              to="/about"
              className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
            >
              About
            </Link>
            {user ? (
              <>
                <Link
                  to={dashboardHref ?? "/"}
                  className="rounded-md border border-current/20 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => navigate(`/${user.role}/profile/${user.userId}/edit`)}
                  className="flex items-center gap-2 rounded-md border border-current/20 px-2 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                  <div className="flex-shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase w-6 h-6">
                    {initials}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-semibold leading-none">{user.firstName ?? user.username} {user.lastName ?? ""}</div>
                    <div className="text-[10px] text-current/70 leading-none">@{user.username}</div>
                  </div>
                </button>
                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-current/25 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Sign Out
                  </button>
                </Form>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md border border-current/25 px-3 py-1.5 text-current hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="rounded-md px-3 py-1.5 text-current/90 hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
