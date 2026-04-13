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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6 block">← Home</Link>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          About
        </h1>

        {usingFallback ? (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Live metadata is temporarily unavailable. Showing fallback information.
          </p>
        ) : null}

        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          <b>Team:</b> {aboutInfo.Team}
          <br />
          <b>Product Name:</b> {aboutInfo.ProductName}
          <br />
          <b>Description:</b> {aboutInfo.ProductDescription}
          <br />
          <b>Version:</b> {aboutInfo.Version}
          <br />
          <b>Release Date:</b> {releaseDate}
        </p>
      </div>
    </div>
  );
}