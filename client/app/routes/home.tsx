import { Link, Form, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { Card } from "~/components";
import { Button } from "~/components/Button";
import { getSession } from "~/utils/session.server";

const ROLE_HOME_PATHS = {
  driver: "/driver/dashboard",
  sponsor: "/sponsor/dashboard",
  admin: "/admin/dashboard",
} as const;

export function loader({ request }: Route.LoaderArgs) {
  const session = getSession(request);
  return { user: session ?? null };
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "FleetScore | Trucking Rewards That Drive Performance" },
    {
      name: "description",
      content:
        "FleetScore helps sponsors reward safe, reliable drivers with points that convert into real catalog value.",
    },
  ];
}

export default function Home() {
  const { user } = useLoaderData<typeof loader>();
  const dashboardHref = user
    ? ROLE_HOME_PATHS[user.UserType as keyof typeof ROLE_HOME_PATHS] ?? "/"
    : "/register";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-white">
      <div className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_20%_10%,rgba(251,146,60,0.16),transparent_46%),radial-gradient(circle_at_78%_26%,rgba(14,165,233,0.14),transparent_48%),linear-gradient(130deg,#f8fafc_0%,#eef2ff_48%,#e0f2fe_100%)] dark:border-orange-300/20 dark:bg-[radial-gradient(circle_at_20%_10%,rgba(251,146,60,0.28),transparent_46%),radial-gradient(circle_at_78%_26%,rgba(14,165,233,0.22),transparent_48%),linear-gradient(130deg,#020617_0%,#0b1120_48%,#172554_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:38px_38px] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]" />
        <div className="container-padding section-spacing relative">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-center">
            <div className="space-y-6 lg:col-span-7">
              <h1 className="font-display landing-fade-up landing-delay-1 text-4xl font-black leading-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
                Reward the driving habits your fleet depends on.
              </h1>
              <p className="landing-fade-up landing-delay-2 max-w-2xl text-base text-slate-700 dark:text-slate-200 sm:text-lg">
                FleetScore helps sponsors turn performance into meaningful rewards while drivers
                track progress, redeem points, and stay motivated with transparent feedback.
              </p>
              <div className="landing-fade-up landing-delay-3 flex flex-wrap items-center gap-3">
                <Link to={dashboardHref}>
                  <Button className="bg-orange-500 hover:bg-orange-400 text-slate-950 font-extrabold" size="lg">
                    {user ? "Go To My Dashboard" : "Get Started"}
                  </Button>
                </Link>
                <Link to="/features">
                  <Button variant="secondary" size="lg" className="border border-slate-300 bg-white/80 text-slate-900 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
                    Learn More
                  </Button>
                </Link>
                {user ? (
                  <Form method="post" action="/logout">
                    <Button variant="ghost" size="lg" className="text-slate-900 hover:bg-slate-200 dark:text-white dark:hover:bg-white/10">
                      Sign Out
                    </Button>
                  </Form>
                ) : (
                  <Link to="/login" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-cyan-100">
                    Already have an account? Sign in
                  </Link>
                )}
              </div>
              {user ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Signed in as <span className="font-bold text-slate-900 dark:text-white">{user.Username}</span> ({user.UserType})
                </p>
              ) : null}
            </div>

            <div className="lg:col-span-5">
              <Card className="border-slate-200 bg-white/80 p-6 backdrop-blur-sm dark:border-white/20 dark:bg-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-100">Live Impact</p>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-white/90 p-4 dark:border-white/20 dark:bg-white/10">
                    <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-200">Driver Retention</p>
                    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">+22%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white/90 p-4 dark:border-white/20 dark:bg-white/10">
                    <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-200">Reward Usage</p>
                    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">89%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white/90 p-4 dark:border-white/20 dark:bg-white/10">
                    <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-200">Sponsor Visibility</p>
                    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">24/7</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white/90 p-4 dark:border-white/20 dark:bg-white/10">
                    <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-200">Audit Readiness</p>
                    <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Full</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="container-padding py-14 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-10">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">Core Capabilities</p>
            <h2 className="font-display text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">Built for drivers, sponsors, and platform administrators.</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">Sponsors</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Award with confidence</h3>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                Issue points for positive performance, apply deductions with clear reasons, and keep every change visible.
              </p>
            </Card>

            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Drivers</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Track every point</h3>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                View balances, history, and redemptions in one place so performance results are always understandable.
              </p>
            </Card>

            <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Administrators</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Control at platform scale</h3>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                Manage organizations, monitor audits, and enforce policy without losing operational speed.
              </p>
            </Card>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Step 01</p>
                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white">Define performance rules</h3>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Set how points are awarded and deducted with clear sponsor-level standards.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Step 02</p>
                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white">Track behavior in real time</h3>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Drivers and sponsors view the same point story, reducing confusion and dispute risk.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Step 03</p>
                <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white">Redeem meaningful rewards</h3>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Points become tangible value through curated catalogs tied to sponsor programs.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}