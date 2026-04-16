import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/about";
import { toApiUrl } from "~/utils/api-url";

type AboutInfo = {
  Team: string | number;
  ProductName: string;
  ProductDescription: string;
  Version: string | number;
  ReleaseDate: string;
};

const ABOUT_FALLBACK: AboutInfo = {
  Team: "21",
  ProductName: "FleetScore",
  ProductDescription: "Truck driver incentive and rewards platform",
  Version: "N/A",
  ReleaseDate: "",
};

function normalizeAboutInfo(payload: unknown): AboutInfo {
  const data = (payload ?? {}) as Partial<AboutInfo>;

  return {
    Team: data.Team ?? ABOUT_FALLBACK.Team,
    ProductName: data.ProductName ?? ABOUT_FALLBACK.ProductName,
    ProductDescription: data.ProductDescription ?? ABOUT_FALLBACK.ProductDescription,
    Version: data.Version ?? ABOUT_FALLBACK.Version,
    ReleaseDate: data.ReleaseDate ?? ABOUT_FALLBACK.ReleaseDate,
  };
}

function formatReleaseDate(rawDate: string): string {
  if (!rawDate) {
    return "Unavailable";
  }

  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return rawDate;
  }

  return parsedDate.toLocaleDateString();
}

// Fetch data before rendering anything.
export async function loader({ request }: Route.LoaderArgs) {
  try {
    const response = await fetch(toApiUrl("/api/about"), {
      signal: request.signal,
    });

    if (!response.ok) {
      return {
        aboutInfo: ABOUT_FALLBACK,
        usingFallback: true,
      };
    }

    const aboutInfo = await response.json();

    return {
      aboutInfo: normalizeAboutInfo(aboutInfo),
      usingFallback: false,
    };
  } catch {
    return {
      aboutInfo: ABOUT_FALLBACK,
      usingFallback: true,
    };
  }
}

export default function About() {
  const { aboutInfo, usingFallback } = useLoaderData<typeof loader>();
  const releaseDate = formatReleaseDate(aboutInfo.ReleaseDate);
  const teamMembers = [
    "Eden Sharp",
    "Max Haney",
    "Abigail Clanton",
    "Kyle Scannell",
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-gray-950 dark:text-white">
      <div className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.14),transparent_42%),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.12),transparent_48%),linear-gradient(140deg,#f8fafc_0%,#eff6ff_52%,#e2e8f0_100%)] dark:border-cyan-300/20 dark:bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.25),transparent_42%),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.2),transparent_48%),linear-gradient(140deg,#020617_0%,#111827_52%,#172554_100%)]">
        <div className="container-padding py-12 sm:py-14">
          <div className="mx-auto max-w-6xl space-y-5">
            <Link
              to="/"
              className="inline-flex text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-cyan-100"
            >
              ← Back to Home
            </Link>
            <h1 className="font-display text-4xl font-black text-slate-900 dark:text-white sm:text-5xl">About FleetScore</h1>
            <p className="max-w-3xl text-base text-slate-700 dark:text-slate-200 sm:text-lg">
              FleetScore is a truck driver incentive and rewards platform designed to give sponsors,
              drivers, and administrators a shared source of truth for points, catalogs, and accountability.
            </p>
          </div>
        </div>
      </div>

      <div className="container-padding py-12 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-6xl space-y-8">
          {usingFallback ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Live metadata is temporarily unavailable. Showing fallback information.
            </p>
          ) : null}

          <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <InfoCard label="Team" value={String(aboutInfo.Team)} />
            <InfoCard label="Product" value={aboutInfo.ProductName} />
            <InfoCard label="Version" value={String(aboutInfo.Version)} />
            <InfoCard label="Release Date" value={releaseDate} />
            <InfoCard
              label="Description"
              value={aboutInfo.ProductDescription}
              className="md:col-span-2 lg:col-span-4"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-700 dark:bg-slate-900/60">
            <h2 className="font-display text-2xl font-black text-slate-900 dark:text-white">Project Team</h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              FleetScore was developed for Clemson University Spring 2026 Senior Computing Practicum.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-700 dark:text-slate-200">
              {teamMembers.map((member) => (
                <li key={member} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
                  {member}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap gap-3">
            <Link to="/features" className="rounded-md border border-cyan-300/30 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-300/10 dark:text-cyan-200 dark:hover:bg-cyan-300/20">
              View Features
            </Link>
            <Link to="/register" className="rounded-md border border-orange-300/30 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 dark:bg-orange-300/10 dark:text-orange-200 dark:hover:bg-orange-300/20">
              Create Account
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}