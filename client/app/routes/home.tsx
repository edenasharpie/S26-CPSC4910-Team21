import type { Route } from "./+types/home";
import { Link } from "react-router";
import { Card } from "~/components";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FleetScore" },
    { name: "description", content: "FleetScore Homepage" },
  ];
}

const NAV_SECTIONS = [
  {
    label: "Driver",
    links: [
      { to: "/driver/catalogs", label: "Catalogs" },
    ],
  },
  {
    label: "Sponsor",
    links: [
      { to: "/sponsor/catalogs", label: "Catalogs" },
    ],
  },
  {
    label: "Admin",
    links: [
      { to: "/admin/dashboard", label: "Dashboard" },
      { to: "/admin/audit-logs", label: "Audit Logs" },
      { to: "/admin/catalogs", label: "Catalogs" },
      { to: "/admin/invoices", label: "Invoices" },
      { to: "/admin/profile/1", label: "Profile (id=1)" },
      { to: "/admin/profile/1/points", label: "Profile Points (id=1)" },
    ],
  },
  {
    label: "General",
    links: [
      { to: "/about", label: "About" },
      { to: "/components-demo", label: "Components Demo" },
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Title Hero */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Welcome to FleetScore!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              {"<subtitle/description>"}
            </p>
          </div>

          {/* Debug Navigation */}
          <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-yellow-700 dark:text-yellow-400">
              Debug Navigation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {NAV_SECTIONS.map((section) => (
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