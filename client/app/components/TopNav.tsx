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

  return (
    <header className={`border-b ${NAV_SHELL_BY_ROLE[role]}`}>
      <div className="container-padding py-3">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-lg font-black tracking-tight text-current hover:opacity-80"
            >
              FleetScore
            </Link>
            <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider">
              {role === "guest" ? "Guest Nav" : `${role} Nav`}
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
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
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="text-xs font-semibold leading-none">{user.firstName} {user.lastName}</div>
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
