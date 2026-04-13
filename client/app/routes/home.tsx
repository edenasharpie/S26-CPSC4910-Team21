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
    : "/login";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="relative overflow-hidden border-b border-orange-300/20 bg-[radial-gradient(circle_at_20%_10%,rgba(251,146,60,0.28),transparent_46%),radial-gradient(circle_at_78%_26%,rgba(14,165,233,0.22),transparent_48%),linear-gradient(130deg,#020617_0%,#0b1120_48%,#172554_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:38px_38px]" />
        <div className="container-padding section-spacing relative">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-center">
            <div className="space-y-6 lg:col-span-7">
              <p className="landing-fade-up inline-flex rounded-full border border-orange-200/30 bg-orange-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100">
                Fleet Incentive Platform
              </p>
              <h1 className="font-display landing-fade-up landing-delay-1 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                Reward the driving habits your fleet depends on.
              </h1>
              <p className="landing-fade-up landing-delay-2 max-w-2xl text-base text-slate-200 sm:text-lg">
                FleetScore helps sponsors turn performance into meaningful rewards while drivers
                track progress, redeem points, and stay motivated with transparent feedback.
              </p>
              <div className="landing-fade-up landing-delay-3 flex flex-wrap items-center gap-3">
                <Link to={dashboardHref}>
                  <Button className="bg-orange-500 hover:bg-orange-400 text-slate-950 font-extrabold" size="lg">
                    {user ? "Go To My Dashboard" : "Get Started"}
                  </Button>
                </Link>
                <Link to="/about">
                  <Button variant="secondary" size="lg" className="border border-white/20 bg-white/10 text-white hover:bg-white/20">
                    Learn More
                  </Button>
                </Link>
                {user ? (
                  <Form method="post" action="/logout">
                    <Button variant="ghost" size="lg" className="text-white hover:bg-white/10">
                      Sign Out
                    </Button>
                  </Form>
                ) : (
                  <Link to="/login" className="text-sm font-semibold text-cyan-200 hover:text-cyan-100">
                    Already have an account? Sign in
                  </Link>
                )}
              </div>
              {user ? (
                <p className="text-sm text-slate-300">
                  Signed in as <span className="font-bold text-white">{user.Username}</span> ({user.UserType})
                </p>
              ) : null}
            </div>

            <div className="lg:col-span-5">
              <Card className="border-white/20 bg-white/10 p-6 backdrop-blur-sm dark:bg-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Live Impact</p>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-200">Driver Retention</p>
                    <p className="mt-2 text-3xl font-black text-white">+22%</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-200">Reward Usage</p>
                    <p className="mt-2 text-3xl font-black text-white">89%</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-200">Sponsor Visibility</p>
                    <p className="mt-2 text-3xl font-black text-white">24/7</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-200">Audit Readiness</p>
                    <p className="mt-2 text-3xl font-black text-white">Full</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Why Teams Choose FleetScore</p>
            <h2 className="font-display text-3xl font-black text-white sm:text-4xl">One platform for rewards, accountability, and growth.</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Card className="border-slate-800 bg-slate-900 p-6 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">Sponsors</p>
              <h3 className="mt-2 text-2xl font-black text-white">Award with confidence</h3>
              <p className="mt-2 text-sm text-slate-300">
                Issue points for positive performance, apply deductions with clear reasons, and keep every change visible.
              </p>
            </Card>

            <Card className="border-slate-800 bg-slate-900 p-6 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Drivers</p>
              <h3 className="mt-2 text-2xl font-black text-white">Track every point</h3>
              <p className="mt-2 text-sm text-slate-300">
                View balances, history, and redemptions in one place so performance results are always understandable.
              </p>
            </Card>

            <Card className="border-slate-800 bg-slate-900 p-6 dark:bg-slate-900 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Admins</p>
              <h3 className="mt-2 text-2xl font-black text-white">Control at platform scale</h3>
              <p className="mt-2 text-sm text-slate-300">
                Manage organizations, monitor audits, and enforce policy without losing operational speed.
              </p>
            </Card>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Step 01</p>
                <h3 className="mt-2 text-xl font-black text-white">Define performance rules</h3>
                <p className="mt-2 text-sm text-slate-300">Set how points are awarded and deducted with clear sponsor-level standards.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Step 02</p>
                <h3 className="mt-2 text-xl font-black text-white">Track behavior in real time</h3>
                <p className="mt-2 text-sm text-slate-300">Drivers and sponsors view the same point story, reducing confusion and dispute risk.</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Step 03</p>
                <h3 className="mt-2 text-xl font-black text-white">Redeem meaningful rewards</h3>
                <p className="mt-2 text-sm text-slate-300">Points become tangible value through curated catalogs tied to sponsor programs.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-200/20 bg-cyan-950/40 p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Ready to launch your rewards program?</p>
              <p className="mt-2 text-sm text-slate-200">Use FleetScore to align driver performance with sponsor priorities.</p>
            </div>
            <Link to={dashboardHref}>
              <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200 font-bold" size="lg">
                {user ? "Open My Dashboard" : "Start With FleetScore"}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}