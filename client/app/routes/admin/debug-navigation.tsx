import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/debug-navigation";
import { Card } from "~/components";
import { requireAuth } from "~/utils/session.server";

export function loader({ request }: Route.LoaderArgs) {
  const session = requireAuth(request, ["admin"]);

  const sections = [
    {
      label: "Driver",
      links: [
        { to: "/driver/dashboard", label: "Dashboard" },
        { to: "/driver/catalogs", label: "Catalogs" },
        { to: "/driver/orders", label: "Orders" },
        { to: "/driver/apply", label: "Apply" },
      ],
    },
    {
      label: "Sponsor",
      links: [
        { to: "/sponsor/dashboard", label: "Dashboard" },
        { to: "/sponsor/catalogs", label: "Catalogs" },
        { to: "/sponsor/reviews", label: "Manage Driver Reviews" },
        { to: "/sponsor/invoices", label: "Invoices" },
        { to: "/sponsor/reports", label: "Reports" },
        { to: "/sponsor/manage-users", label: "Manage Users" },
        { to: "/sponsor/driver-purchases", label: "Driver Purchases" },
        { to: "/sponsor/applications", label: "Applications" },
        { to: `/sponsor/settings/${session.UserID}`, label: "My Settings" },
      ],
    },
    {
      label: "Admin",
      links: [
        { to: "/admin/dashboard", label: "Dashboard" },
        { to: "/admin/audit-logs", label: "Audit Logs" },
        { to: "/admin/catalogs", label: "Catalogs" },
        { to: "/admin/invoices", label: "Invoices" },
        { to: "/admin/reports", label: "Reports" },
        { to: "/admin/add-driver", label: "Add Driver" },
        { to: "/admin/add-sponsor", label: "Add Sponsor" },
        { to: `/admin/settings/${session.UserID}`, label: "My Settings" },
        { to: `/admin/profile/${session.UserID}/edit`, label: "My Profile Edit" },
        { to: `/admin/profile/${session.UserID}/points`, label: "My Profile Points" },
      ],
    },
    {
      label: "General",
      links: [
        { to: "/", label: "Home" },
        { to: "/about", label: "About" },
        { to: "/components-demo", label: "Components Demo" },
      ],
    },
  ];

  return {
    session,
    sections,
  };
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Admin Debug Navigation | FleetScore" },
    {
      name: "description",
      content: "Internal admin-only route map for FleetScore development and QA workflows.",
    },
  ];
}

export default function AdminDebugNavigation() {
  const { sections } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="text-left">
            <Link
              to="/admin/dashboard"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back to Admin Dashboard
            </Link>
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
              Internal Admin Tool
            </p>
            <h1 className="mt-2 text-2xl font-black text-gray-900 dark:text-gray-100">
              Debug Navigation Index
            </h1>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              This route centralizes navigation shortcuts for development and QA. It is restricted to admin users.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <Card key={section.label} className="p-4 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {section.label}
                </h2>
                <ul className="space-y-1">
                  {section.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
