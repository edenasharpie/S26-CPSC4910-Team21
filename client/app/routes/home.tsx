import { Link, Form, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { Card } from "~/components";
import { Button } from "~/components/Button";
import { getSession } from "~/utils/session.server";

export function loader({ request }: Route.LoaderArgs) {
  const user = getSession(request);
  return { user };
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "FleetScore" },
    { name: "description", content: "FleetScore Homepage" },
  ];
}

function buildNavSections(user: { UserID: number; UserType: string } | null) {
  const userId = user?.UserID;

  return [
    {
      label: "Driver",
      links: [
        { to: "/driver/dashboard", label: "Dashboard" },
        { to: "/driver/catalogs", label: "Catalogs" },
        { to: "/driver/orders", label: "Orders" },
      ],
    },
    {
      label: "Sponsor",
      links: [
        { to: "/sponsor/dashboard", label: "Dashboard" },
        { to: "/sponsor/catalogs", label: "Catalogs" },
        { to: "/sponsor/invoices", label: "Invoices" },
        { to: "/sponsor/reports", label: "Reports" },
        { to: "/sponsor/manage-users", label: "Manage Users" },
        { to: "/sponsor/driver-purchases", label: "Driver Purchases" },
        { to: "/sponsor/deduct-points", label: "Deduct Points" },
        ...(userId ? [{ to: `/sponsor/settings/${userId}`, label: "My Settings" }] : []),
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
        ...(userId
          ? [
              { to: `/admin/settings/${userId}`, label: "My Settings" },
              { to: `/admin/profile/${userId}/edit`, label: "My Profile Edit" },
              { to: `/admin/profile/${userId}/points`, label: "My Profile Points" },
            ]
          : []),
      ],
    },
    {
      label: "General",
      links: [
        { to: "/about", label: "About" },
        { to: "/profile", label: "Profile" },
        { to: "/components-demo", label: "Components Demo" },
      ],
    },
  ];
}

export default function Home() {
  const { user } = useLoaderData<typeof loader>();
  const navSections = buildNavSections(user ?? null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Title Hero */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Welcome to FleetScore!
            </h1>
            {user ? (
              <Form method="post" action="/logout" className="inline-flex flex-col items-center gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Signed in as <span className="font-semibold text-gray-700 dark:text-gray-200">{user.Username}</span>
                  {" "}({user.UserType})
                </p>
                <Button variant="secondary" size="lg" type="submit">Sign Out</Button>
              </Form>
            ) : (
              <Link to="/login">
                <Button variant="primary" size="lg">Sign In</Button>
              </Link>
            )}
          </div>

          {/* Debug Navigation */}
          <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
              Debug Navigation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {navSections.map((section) => (
                <Card key={section.label} className="p-4 space-y-2">
                  <h2 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {section.label}
                  </h2>
                  <ul className="space-y-1">
                    {section.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
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
    </div>
  );
}