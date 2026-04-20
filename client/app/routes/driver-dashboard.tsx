import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Badge, Card, Table, Button } from "~/components";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

// 1. Define the Data Structure
interface PointTransaction {
  PointChange: number;
  ReasonForChange: string;
  TimeChanged: string;
}

interface PointData {
  balance: number;
  history: PointTransaction[];
}

interface PerformanceData {
  performanceStatus?: string;
}

function isDisplayableDate(value: unknown): boolean {
  if (!value) return false;
  const parsed = new Date(value as string | number | Date);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000;
}

function parseCookieNumber(cookieHeader: string, name: string): number | null {
  const pattern = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookieHeader.match(pattern);
  if (!match) return null;
  const parsed = Number(decodeURIComponent(match[1]));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await requireAuth(request, ["driver"]);
  const userId = params.id ?? session.UserID;

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const requestInit = cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined;

  try {
    const [statusRes, sponsorsRes] = await Promise.all([
      fetch(`${API_URL}/api/drivers/performance/${userId}`, requestInit),
      fetch(`${API_URL}/api/drivers/sponsors/${userId}`, requestInit),
    ]);

    const statusData: PerformanceData = statusRes.ok
      ? await statusRes.json()
      : { performanceStatus: undefined };

    const sponsorsPayload = sponsorsRes.ok ? await sponsorsRes.json() : [];
    const sponsors = Array.isArray(sponsorsPayload) ? sponsorsPayload : [];

    const preferredSponsorCompanyId = parseCookieNumber(cookieHeader, "driverSponsorCompanyId");
    const selectedSponsorCompanyId =
      Number.isInteger(preferredSponsorCompanyId) &&
      sponsors.some((row: any) => Number(row?.SponsorCompanyID) === preferredSponsorCompanyId)
        ? preferredSponsorCompanyId
        : Number(sponsors[0]?.SponsorCompanyID) || null;

    const pointsRes = Number.isInteger(selectedSponsorCompanyId)
      ? await fetch(
          `${API_URL}/api/drivers/my-points/${userId}?sponsorCompanyId=${selectedSponsorCompanyId}`,
          requestInit
        )
      : null;

    const pointsData: PointData = pointsRes && pointsRes.ok
      ? await pointsRes.json()
      : { balance: 0, history: [] };

    return {
      session,
      balance: pointsData.balance ?? 0,
      history: pointsData.history ?? [],
      performanceStatus: statusData.performanceStatus,
    };
  } catch (error) {
    console.error("Driver Loader Error:", error);
    return { session, balance: 0, history: [], performanceStatus: undefined };
  }
}

// 4. The Page Component
export default function DriverDashboard() {
  const data = useLoaderData<typeof loader>();
  
  const { balance = 0, history = [], performanceStatus } = data || {};
  const displayHistory = history.filter((row: PointTransaction) => isDisplayableDate(row.TimeChanged));
  const normalizedPerformanceStatus = (performanceStatus ?? "").toLowerCase();
  const performanceBadgeVariant =
    normalizedPerformanceStatus === "excellent"
      ? "success"
      : normalizedPerformanceStatus === "good"
      ? "info"
      : normalizedPerformanceStatus === "average"
      ? "warning"
      : normalizedPerformanceStatus === "poor"
      ? "danger"
      : "default";

  const columns = [
    { 
      key: "PointChange", 
      header: "Change",
      render: (row: PointTransaction) => (
        <span className={`font-bold ${row.PointChange >= 0 ? "text-green-600" : "text-red-600"}`}>
          {row.PointChange >= 0 ? `+${row.PointChange}` : row.PointChange}
        </span>
      )
    },
    { key: "ReasonForChange", header: "Reason" },
    { 
      key: "TimeChanged", 
      header: "Date",
      render: (row: PointTransaction) => new Date(row.TimeChanged).toLocaleDateString() 
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            &larr; Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Driver Rewards</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <Card className="p-8 bg-indigo-600 text-white shadow-xl">
            <h2 className="text-indigo-100 text-sm font-semibold uppercase">Available Points</h2>
            <div className="text-6xl font-black mt-2">{balance.toLocaleString()}</div>
          </Card>
          <Card className="p-8 bg-white dark:bg-gray-900 shadow-xl">
            <h2 className="text-gray-500 text-sm font-semibold uppercase">Performance Status</h2>
            <div className="mt-4">
              <Badge variant={performanceBadgeVariant} size="md" className="capitalize">
                {performanceStatus ?? "Not set"}
              </Badge>
            </div>
          </Card>
        </div>

        <section className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-6">Transaction History</h2>
          <Table data={displayHistory} columns={columns} />
        </section>
      </div>
    </div>
  );
}