import type { Route } from "./+types/dashboard";
import { useMemo } from "react";
import { Table, Button } from "~/components";
import { useNavigate, useLoaderData, Link, Form } from "react-router";
import { requireAuth } from "~/utils/session.server";
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

const API_URL = process.env.API_URL ?? "http://localhost:5000";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireAuth(request, ["driver", "admin"]);
  const effectiveUserId = String(session.UserID);

  try {
    // Use the existing driver endpoints and gracefully degrade on partial failures.
    const [pointsRes, performanceRes] = await Promise.all([
      fetch(`${API_URL}/api/drivers/my-points/${effectiveUserId}`),
      fetch(`${API_URL}/api/drivers/performance/${effectiveUserId}`),
    ]);

    const pointsPayload = pointsRes.ok ? await pointsRes.json() : null;
    const performancePayload = performanceRes.ok ? await performanceRes.json() : null;

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
      sponsors: [],
      session,
      effectiveUserId,
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
    };
  }
}

export default function DriverDashboard() {
  const { driver, history, sponsors, effectiveUserId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Performance status logic
  const statusConfig = {
    excellent: { icon: "🌟", color: "text-yellow-500" },
    good: { icon: "✅", color: "text-green-500" },
    average: { icon: "⚠️", color: "text-orange-500" },
    poor: { icon: "📉", color: "text-red-500" }
  };
  
  const currentStatus = statusConfig[driver?.PerformanceStatus?.toLowerCase() as keyof typeof statusConfig] || statusConfig.good;

  // Compute chart data exactly like the Points Page logic
  const chartData = useMemo(() => {
  if (!history || history.length === 0) return [];

  // 1. Sort history from OLDEST to NEWEST
  const sortedHistory = [...history].sort((a: any, b: any) =>
    new Date(a.TimeChanged).getTime() - new Date(b.TimeChanged).getTime()
  );

  // 2. Calculate the "Starting Balance" 
  // We take the current total and subtract every change that ever happened
  const totalChange = history.reduce((sum: number, item: any) => sum + Number(item.PointChange), 0);
  let runningBalance = (driver?.PointBalance ?? 0) - totalChange;

  // 3. Build the chart points by adding changes back in one by one
  return sortedHistory.map((item: any) => {
    runningBalance += Number(item.PointChange);
    return {
      date: new Date(item.TimeChanged).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      balance: runningBalance,
    };
  });
}, [history, driver?.PointBalance]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* --- HEADER --- */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="text-left">
            <Link to="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-2 block">
              ← Home
            </Link>
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white uppercase">
                  Driver Dashboard
                </h1>
                <p className="text-gray-500 text-sm mt-1 font-medium italic">
                  ID: <span className="font-mono text-indigo-500">{effectiveUserId}</span>
                </p>
              </div>
              
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                  {(driver?.PointBalance ?? 0).toLocaleString()}
                </span>
                <span className="text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400 font-semibold">
                  Total<br/>Points
                </span>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {currentStatus.icon}
                </span>
                <span className="text-xs uppercase tracking-tight text-emerald-600 dark:text-emerald-400 font-semibold leading-tight">
                  Driver<br/>Status
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Form method="post" action="/logout">
              <Button variant="secondary" size="sm" type="submit">Sign out</Button>
            </Form>
            <button
              type="button"
              onClick={() => navigate(`/driver/profile/${effectiveUserId}/edit`)}
              className="flex items-center gap-3 p-1.5 pr-5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase">
                {driver?.FirstName?.[0]}{driver?.LastName?.[0]}
              </div>
              <div className="block text-left">
                <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">{driver?.FirstName} {driver?.LastName}</p>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">@{driver?.Username}</p>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Sidebar - SPONSORS (Dynamic from DB) */}
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
                      onClick={() => navigate(`/shop/catalog/${s.SponsorID}`)}
                    >
                      View Catalog
                    </Button>
                  </div>
                )) : (
                  <div className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-center">
                    <p className="text-xs text-gray-400">No active sponsors.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-8 space-y-6">
            <div className="bg-white dark:bg-gray-900 p-6 shadow-md rounded-xl border dark:border-gray-800 text-left">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Point Progress</h2>
              <div className="h-72 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
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
                        
                        {/* UPDATED TOOLTIP */}
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
                            tooltipType="none" // Prevents the area from double-counting in the tooltip
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
                data={history} 
                columns={[
                  {
                    key: "Date",
                    header: "Date",
                    render: (t: any) => <span className="text-xs text-gray-500 font-mono">{new Date(t.TimeChanged).toLocaleDateString()}</span>,
                  },
                  {
                    key: "Reason",
                    header: "Activity",
                    render: (t: any) => <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">{t.ReasonForChange}</span>,
                  },
                  {
                    key: "Change",
                    header: "Points",
                    render: (t: any) => (
                      <span className={`font-bold ${t.PointChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {t.PointChange >= 0 ? `+${t.PointChange}` : t.PointChange}
                      </span>
                    ),
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