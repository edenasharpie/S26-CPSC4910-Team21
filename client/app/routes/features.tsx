import { Link } from "react-router";
import type { Route } from "./+types/features";
import { Card } from "~/components";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "FleetScore Features" },
    {
      name: "description",
      content:
        "Explore FleetScore capabilities across driver, sponsor, and administrator workflows.",
    },
  ];
}

export default function FeaturesPage() {
  const roleSections = [
    {
      title: "Driver Tools",
      points: [
        "Browse sponsor catalogs and redeem points.",
        "Track point activity and order history.",
        "Stay informed through role-specific notifications.",
      ],
      accent: "text-cyan-300",
    },
    {
      title: "Sponsor Tools",
      points: [
        "Manage fleet members and application workflows.",
        "Award or deduct points with reasons and visibility.",
        "Review invoices, purchases, and sponsor-scoped reports.",
      ],
      accent: "text-orange-300",
    },
    {
      title: "Administrator Tools",
      points: [
        "Oversee users, catalogs, and platform-wide reporting.",
        "Review audit logs and account activity signals.",
        "Use identity assumption workflows for support and validation.",
      ],
      accent: "text-rose-300",
    },
  ];

  const platformHighlights = [
    "Role-based permissions for driver, sponsor, and administrator accounts.",
    "Salted SHA-256 password verification and TOTP-based password reset flows.",
    "OpenAPI-documented backend endpoints for maintainable integrations.",
    "API-backed reporting with export-friendly output workflows.",
    "Centralized event and audit logging for security visibility.",
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-white">
      <div className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,0.14),transparent_42%),radial-gradient(circle_at_82%_20%,rgba(251,146,60,0.12),transparent_48%),linear-gradient(130deg,#f8fafc_0%,#eff6ff_52%,#e2e8f0_100%)] dark:border-sky-300/20 dark:bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,0.25),transparent_42%),radial-gradient(circle_at_82%_20%,rgba(251,146,60,0.2),transparent_48%),linear-gradient(130deg,#020617_0%,#0f172a_52%,#1e293b_100%)]">
        <div className="container-padding py-12 sm:py-14">
          <div className="mx-auto max-w-6xl space-y-6">
            <Link
              to="/"
              className="inline-flex text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-cyan-100"
            >
              ← Back to Home
            </Link>
            <h1 className="font-display text-4xl font-black text-slate-900 dark:text-white sm:text-5xl">
              FleetScore Feature Overview
            </h1>
            <p className="max-w-3xl text-base text-slate-700 dark:text-slate-200 sm:text-lg">
              FleetScore is a full-stack incentive and rewards platform designed for trucking organizations
              that need role-based workflows, clear point accountability, and operational visibility.
            </p>
          </div>
        </div>
      </div>

      <div className="container-padding py-12 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Role-Based Capability Sets</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {roleSections.map((section) => (
                <Card key={section.title} className="border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h3 className={`text-lg font-black ${section.accent}`}>{section.title}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {section.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900/60">
            <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Platform Highlights</h2>
            <ul className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-slate-700 dark:text-slate-300">
              {platformHighlights.map((highlight) => (
                <li key={highlight} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
                  {highlight}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
              <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white">Technology Stack</h2>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                Frontend: React, TypeScript, Tailwind CSS. Backend: Node.js, Express, MySQL with REST APIs.
                Infrastructure includes AWS EC2 hosting and AWS RDS database storage.
              </p>
            </Card>
            <Card className="border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-xl font-black text-slate-900 dark:text-white">Next Step</h2>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Create an account to start using role-specific dashboards and workflows.</p>
              <Link to="/register" className="mt-4 inline-flex text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-200">
                Register →
              </Link>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
