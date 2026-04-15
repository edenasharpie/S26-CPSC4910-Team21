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
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="relative overflow-hidden border-b border-cyan-300/20 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.25),transparent_42%),radial-gradient(circle_at_82%_18%,rgba(244,114,182,0.2),transparent_48%),linear-gradient(140deg,#020617_0%,#111827_52%,#172554_100%)]">
        <div className="container-padding py-12 sm:py-14">
          <div className="mx-auto max-w-6xl space-y-5">
            <Link
              to="/"
              className="inline-flex text-sm font-semibold text-cyan-200 hover:text-cyan-100"
            >
              ← Back to Home
            </Link>
            <h1 className="font-display text-4xl font-black sm:text-5xl">About FleetScore</h1>
            <p className="max-w-3xl text-base text-slate-200 sm:text-lg">
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

          <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            <InfoCard label="Team" value={String(aboutInfo.Team)} />
            <InfoCard label="Product" value={aboutInfo.ProductName} />
            <InfoCard label="Description" value={aboutInfo.ProductDescription} className="lg:col-span-2" />
            <InfoCard label="Version" value={String(aboutInfo.Version)} />
            <InfoCard label="Release Date" value={releaseDate} />
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-black text-white">Project Team</h2>
            <p className="mt-2 text-sm text-slate-300">
              FleetScore was developed for Clemson University Spring 2026 Senior Computing Practicum.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-slate-200">
              {teamMembers.map((member) => (
                <li key={member} className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
                  {member}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap gap-3">
            <Link to="/features" className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/20">
              View Features
            </Link>
            <Link to="/register" className="rounded-md border border-orange-300/30 bg-orange-300/10 px-4 py-2 text-sm font-semibold text-orange-200 hover:bg-orange-300/20">
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
    <div className={`rounded-xl border border-slate-800 bg-slate-900 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
    </div>
  );
}