import type { Route } from "./+types/dashboard";
import { useMemo } from "react";
import { Table, Button } from "~/components";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";
import { 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ComposedChart, 
  Area 
} from "recharts";

const API_URL = getApiBaseUrl();

function parseCookieNumber(cookieHeader: string, name: string): number | null {
  const pattern = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookieHeader.match(pattern);
  if (!match) return null;
  const parsed = Number(decodeURIComponent(match[1]));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePointChange(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDisplay(value: unknown): string {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleDateString() : "Unknown";
}

function formatChartDate(value: unknown): string {
  const parsed = parseDateValue(value);
  if (!parsed) return "Unknown";

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["driver", "admin"]);
  const effectiveUserId = String(session.UserID);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const requestInit = cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined;

  try {
    const [performanceRes, sponsorsRes] = await Promise.all([
      fetch(`${API_URL}/api/drivers/performance/${effectiveUserId}`, requestInit),
      fetch(`${API_URL}/api/drivers/sponsors/${effectiveUserId}`, requestInit),
    ]);

    const performancePayload = performanceRes.ok ? await performanceRes.json() : null;
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
          `${API_URL}/api/drivers/my-points/${effectiveUserId}?sponsorCompanyId=${selectedSponsorCompanyId}`,
          requestInit
        )
      : null;

    const pointsPayload = pointsRes && pointsRes.ok ? await pointsRes.json() : null;

    const history = Array.isArray(pointsPayload?.history) ? pointsPayload.history : [];
    const pointBalance = Number(pointsPayload?.balance ?? 0);

    const driver = {
      UserID: session.UserID,
      Username: session.Username,
      FirstName: session.FirstName,
      LastName: session.LastName,
      PointBalance: Number.isFinite(pointBalance) ? pointBalance : 0,
      PerformanceStatus: performancePayload?.performanceStatus,
    };

    return {
      driver,
      history,
      sponsors,
      session,
      effectiveUserId,
      selectedSponsorCompanyId,
    };
  } catch (error) {
    console.error("driver/dashboard loader error:", error);
    return {
      driver: {
        UserID: session.UserID,
        Username: session.Username,
        FirstName: session.FirstName,
        LastName: session.LastName,
        PointBalance: 0,
        PerformanceStatus: undefined,
      },
      history: [],
      sponsors: [],
      session,
      effectiveUserId,
      selectedSponsorCompanyId: null,
    };
  }
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAuth(request, ["driver", "admin"]);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "leave-sponsor") {
    return { success: false, error: "Unsupported action." };
  }

  const effectiveUserId = String(session.UserID);
  const cookieHeader = request.headers.get("Cookie") ?? "";

  const sponsorCompanyId = Number(formData.get("sponsorCompanyId"));
  if (!Number.isInteger(sponsorCompanyId) || sponsorCompanyId <= 0) {
    return { success: false, error: "sponsorCompanyId is required." };
  }

  try {
    const response = await fetch(
      `${API_URL}/api/drivers/${effectiveUserId}/company?sponsorCompanyId=${sponsorCompanyId}`,
      {
        method: "DELETE",
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: String((payload as any).error ?? "Failed to leave sponsor company."),
      };
    }

    return {
      success: true,
      message: String((payload as any).message ?? "You left your sponsor company."),
    };
  } catch (error: any) {
    return { success: false, error: String(error?.message ?? "Failed to leave sponsor company.") };
  }
}


export default function DriverDashboard() {
  const { driver, history, sponsors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLeavingSponsor =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "leave-sponsor";

  // Performance status logic
  const statusConfig = {
    excellent: { label: "Excellent", color: "text-yellow-500" },
    good: { label: "Good", color: "text-green-500" },
    average: { label: "Average", color: "text-orange-500" },
    poor: { label: "Poor", color: "text-red-500" }
  };
  
  const currentStatus = statusConfig[driver?.PerformanceStatus?.toLowerCase() as keyof typeof statusConfig] || statusConfig.good;

  const validHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];

    return history
      .map((item: any) => {
        const pointChange = normalizePointChange(item?.PointChange);
        const parsedDate = parseDateValue(item?.TimeChanged);
        return {
          ...item,
          PointChange: pointChange,
          parsedDate,
        };
      })
      .filter((item: any) => item.parsedDate && item.parsedDate.getFullYear() >= 2000);
  }, [history]);

  // Compute chart data exactly like the Points Page logic
  const chartData = useMemo(() => {
      if (validHistory.length === 0) return [];

      const sortedNewestFirst = [...validHistory].sort(
        (a: any, b: any) => b.parsedDate.getTime() - a.parsedDate.getTime()
      );

      let currentCalcBalance = driver?.PointBalance ?? 0;
      
      const historyWithBalances = sortedNewestFirst.map((item: any) => {
        const pointAtTime = currentCalcBalance;
        currentCalcBalance -= item.PointChange; // Subtract the change to see previous state
        return {
          date: formatChartDate(item.TimeChanged),
          balance: pointAtTime,
        };
      });
      
      return historyWithBalances.reverse();
}, [validHistory, driver?.PointBalance]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* --- HEADER --- */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="text-left">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white uppercase">
                Driver Dashboard
              </h1>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                  {(driver?.PointBalance ?? 0).toLocaleString()}
                </span>
                <span className="text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400 font-semibold">
                  Total<br/>Points
                </span>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <span className="text-xs uppercase tracking-tight text-emerald-600 dark:text-emerald-400 font-semibold leading-tight">
                  Driver<br/>Status
                </span>
                <span className={`text-xl font-black uppercase tracking-tighter ${currentStatus.color}`}>
                  {currentStatus.label}
                </span>
              </div>
            </div>
          </div>

          {actionData && (
            <div
              className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                actionData.success
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {actionData.success ? actionData.message : actionData.error}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-4 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 text-left">My Sponsors</h2>
              <div className="flex flex-col gap-3">
                {sponsors.length > 0 ? sponsors.map((s: any) => (
                  <div key={s.SponsorID} className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-xl p-4 shadow-sm text-left">
                    <div className="mb-3">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                        {s.CompanyName}
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed italic">
                        {s.Description || "Official Program Sponsor"}
                      </p>
                    </div>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="w-full text-[10px] uppercase font-bold tracking-widest py-2"
                      onClick={() => {
                        const sponsorCompanyId = Number(s.SponsorCompanyID);
                        if (Number.isInteger(sponsorCompanyId) && sponsorCompanyId > 0 && typeof document !== "undefined") {
                          const maxAgeSeconds = 60 * 60 * 24 * 365;
                          const secureSuffix = typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
                          document.cookie = `driverSponsorCompanyId=${encodeURIComponent(String(sponsorCompanyId))}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureSuffix}`;
                        }
                        navigate('/driver/catalogs');
                      }}
                    >
                      View Catalog
                    </Button>
                    <Form
                      method="post"
                      className="mt-2"
                      onSubmit={(event) => {
                        const confirmed = window.confirm(
                          `Leave ${s.CompanyName}? This will remove you from this sponsor company.`
                        );
                        if (!confirmed) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="leave-sponsor" />
                      <input type="hidden" name="sponsorCompanyId" value={String(s.SponsorCompanyID)} />
                      <Button
                        type="submit"
                        variant="danger"
                        size="sm"
                        className="w-full text-[10px] uppercase font-bold tracking-widest py-2"
                        disabled={isLeavingSponsor}
                      >
                        {isLeavingSponsor ? "Leaving..." : "Leave Sponsor"}
                      </Button>
                    </Form>
                  </div>
                )) : (
                  <div className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-center space-y-4">
                    <p className="text-xs text-gray-400">No active sponsors.</p>
                    <Button 
                      className="w-full text-[10px] uppercase font-bold tracking-widest"
                      onClick={() => navigate("/driver/apply")}
                    >
                      Apply for Sponsor
                    </Button>
                  </div>
                )}

                {sponsors.length > 0 && (
                  <Button
                    className="w-full text-[10px] uppercase font-bold tracking-widest"
                    onClick={() => navigate('/driver/apply')}
                  >
                    Apply for Sponsor
                  </Button>
                )}
              </div>
            </div>
          </aside>

          <main className="lg:col-span-8 space-y-6">
            <div className="bg-white dark:bg-gray-900 p-6 shadow-md rounded-xl border dark:border-gray-800 text-left">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Point Progress</h2>
              <div className="h-72 w-full" style={{ minHeight: '300px', minWidth: '100%' }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={chartData}>
                        <defs>
                            <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1}/>
                        <XAxis 
                            dataKey="date" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{fill: '#9ca3af'}} 
                        />
                        <YAxis 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{fill: '#9ca3af'}}
                            domain={['auto', 'auto']} 
                        />
                        <Tooltip 
                            cursor={{ stroke: '#6366f1', strokeWidth: 1 }}
                            contentStyle={{ 
                            backgroundColor: '#111827', 
                            border: 'none', 
                            borderRadius: '8px', 
                            fontSize: '12px', 
                            color: '#fff' 
                            }}
                            itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value: number | undefined) => [Number(value ?? 0).toLocaleString(), "Balance"]}
                            labelFormatter={(label) => `Date: ${label}`}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="balance" 
                            stroke="none" 
                            fillOpacity={1} 
                            fill="url(#colorPoints)" 
                            tooltipType="none"
                        />
                        <Line 
                            type="stepAfter" 
                            dataKey="balance" 
                            stroke="#6366f1" 
                            strokeWidth={4} 
                            dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6, strokeWidth: 0 }} 
                        />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                    <p className="text-gray-400 italic text-sm">No activity recorded.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 shadow-md rounded-xl border dark:border-gray-800 overflow-hidden text-left">
              <Table 
                data={validHistory} 
                columns={[
                  {
                    key: "Date",
                    header: "Date",
                    render: (t: any) => <span className="text-xs text-gray-500 font-mono">{formatDateDisplay(t.TimeChanged)}</span>,
                  },
                  {
                    key: "Reason",
                    header: "Activity",
                    render: (t: any) => <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t.ReasonForChange}</span>,
                  },
                  {
                    key: "Change",
                    header: "Points",
                    render: (t: any) => {
                      const pointChange = normalizePointChange(t.PointChange);
                      return (
                        <span className={`font-bold ${pointChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pointChange >= 0 ? `+${pointChange}` : pointChange}
                        </span>
                      );
                    },
                  },
                ]} 
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}