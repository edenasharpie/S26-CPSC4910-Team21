//Imports
import type { Route } from "./+types/dashboard";
import { useState, useEffect } from "react";
import { Table, Input, Button, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link, redirect } from "react-router";
import {
  requireAuth,
  signToken,
  buildSetCookieHeader,
  buildAssumedSession,
  ROLE_HOME,
} from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

//Loader
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAuth(request, ['sponsor']);
  try {
    const companyRes = await fetch(`${API_URL}/api/sponsors/user/${user.UserID}`);
    if (!companyRes.ok) throw new Error(`Could not load company info (${companyRes.status})`);
    const company = await companyRes.json();

    const driversRes = await fetch(`${API_URL}/api/sponsors/${user.UserID}/my-drivers`);
    if (!driversRes.ok) throw new Error(`Could not load drivers (${driversRes.status})`);
    const drivers = await driversRes.json();

    const mergedUser = {
      ...user,
      FirstName: company.firstName ?? (user as any).FirstName,
      LastName: company.lastName ?? (user as any).LastName,
      Username: company.username ?? user.Username,
      ProfilePicture: company.profilePicture ?? (user as any).ProfilePicture ?? "",
    };

    return {
      user: mergedUser,
      companyId: company.sponsorCompanyId as number,
      companyName: company.companyName as string,
      drivers: Array.isArray(drivers) ? drivers : [],
      error: null as string | null,
    };
  } catch (error: any) {
    return { user, companyId: null as number | null, companyName: 'Unknown', drivers: [] as any[], error: error.message as string };
  }
}

// --- ACTION ---
export async function action({ request }: Route.ActionArgs) {
  const user = requireAuth(request, ['sponsor']);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'create-driver');

  if (intent === 'assume-driver') {
    const driverUserId = Number(formData.get('targetUserId'));
    if (!Number.isInteger(driverUserId)) {
      return { success: false, error: 'Invalid driver selected for assume view.' };
    }

    try {
      const assumeRes = await fetch(`${API_URL}/api/sponsors/${user.UserID}/assume-driver/${driverUserId}`, {
        method: 'POST',
      });

      const assumeResult = await assumeRes.json().catch(() => ({}));
      if (!assumeRes.ok || !assumeResult.success || !assumeResult.assumedUser) {
        return { success: false, error: assumeResult.error ?? 'Failed to assume selected driver.' };
      }

      const originalIdentity = user.OriginalUser ?? {
        UserID: user.UserID,
        UserType: user.UserType,
        Username: user.Username,
        FirstName: user.FirstName,
        LastName: user.LastName,
      };

      const nextSession = buildAssumedSession(originalIdentity, assumeResult.assumedUser);
      const token = signToken(nextSession);
      const assumedRole = String(assumeResult.assumedUser.UserType).toLowerCase() as 'driver' | 'sponsor' | 'admin';

      return redirect(ROLE_HOME[assumedRole] ?? '/', {
        headers: {
          'Set-Cookie': buildSetCookieHeader(token),
        },
      });
    } catch (error: any) {
      return { success: false, error: error.message ?? 'Failed to assume selected driver.' };
    }
  }

  const companyRes = await fetch(`${API_URL}/api/sponsors/user/${user.UserID}`);
  if (!companyRes.ok) return { success: false, error: 'Could not determine your company.' };
  const { sponsorCompanyId } = await companyRes.json();

  try {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.get('username'),
        email: formData.get('email'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        userType: 'driver',
        activeStatus: 1,
        licenseNumber: formData.get('licenseNumber'),
        performanceStatus: 'good',
        sponsorCompanyId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: (err as any).error ?? 'Failed to create driver' };
    }
    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- MAIN COMPONENT ---
export default function SponsorPortal() {
  const { user, companyId, companyName, drivers, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isAssumedMode = Boolean(user?.OriginalUser);
  const userProfilePicture = (user as any).ProfilePicture ?? "";
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const navigate = useNavigate();

  // --- STAT CALCULATIONS ---
  const totalCount = drivers.length;
  const activeCount = drivers.filter((d: any) => d.ActiveStatus === 1).length;
  const inactiveCount = drivers.filter((d: any) => d.ActiveStatus === 0).length;
  const totalPoints = drivers.reduce((sum: number, d: any) => sum + (d.PointBalance ?? 0), 0);

  useEffect(() => {
    if ((actionData as any)?.success) setIsAddUserOpen(false);
  }, [actionData]);

  const filteredDrivers = drivers.filter((d: any) => {
    const search = searchQuery.toLowerCase();
    const matchesSearch = 
      d.Username.toLowerCase().includes(search) ||
      d.FirstName.toLowerCase().includes(search) ||
      d.LastName.toLowerCase().includes(search);
    
    const matchesStatus = 
      statusFilter === "all" || 
      (statusFilter === "active" && d.ActiveStatus === 1) || 
      (statusFilter === "inactive" && d.ActiveStatus === 0);

    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "Avatar",
      header: "Avatar",
      render: (user: any) => {
        return (
          <AvatarOrInitials
            profilePicture={user.ProfilePicture}
            firstName={user.FirstName}
            lastName={user.LastName}
            className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800"
            initialsClassName="text-[11px]"
          />
        );
      },
    },
    {
      key: "Name",
      header: "Driver",
      render: (user: any) => (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {user.FirstName} {user.LastName}
            </span>
            {user.ActiveStatus === 0 && (
              <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase border border-red-100">Inactive</span>
            )}
          </div>
          <span className="text-xs text-gray-400 font-mono">{user.Username}</span>
        </div>
      ),
    },
    {
      key: "Points",
      header: "Points",
      render: (user: any) => (
        <button 
          type="button"
          onClick={() => navigate(`/sponsor/profile/${user.UserID}/points`)}
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 hover:border-indigo-400 transition-all"
        >
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{user.PointBalance ?? 0}</span>
          <span className="text-[10px] uppercase tracking-tighter text-indigo-400 font-bold">Manage</span>
        </button>
      )
    },
    {
      key: "Assume",
      header: "Assume",
      render: (driver: any) => {
        const isActive = driver.ActiveStatus === 1;
        if (!isActive || isAssumedMode) {
          return <span className="text-gray-300 pl-4">—</span>;
        }

        return (
          <Form method="post" className="pr-2">
            <input type="hidden" name="intent" value="assume-driver" />
            <input type="hidden" name="targetUserId" value={driver.UserID} />
            <Button type="submit" size="sm" variant="primary">Assume</Button>
          </Form>
        );
      },
    },
    {
      key: "edit",
      header: "", 
      render: (user: any) => (
        <div className="flex justify-end pr-4">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/sponsor/profile/${user.UserID}/edit`)}>View Profile</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header Section */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800 flex justify-between items-end">
          <div className="text-left">
            <Link to="/" className="text-sm font-medium text-blue-600 hover:underline mb-2 block">← Home</Link>
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Sponsor Dashboard</h1>
                <p className="text-gray-500 text-sm mt-1 font-medium italic">{companyName}</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{totalPoints.toLocaleString()}</span>
                <span className="text-xs uppercase tracking-tight text-indigo-600 dark:text-indigo-400 font-semibold">Total<br/>Points</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAssumedMode && (
              <Form method="post" action="/exit-assumption">
                <Button variant="primary" size="sm" type="submit">Exit Assumed View</Button>
              </Form>
            )}
            <Link
              to={`/sponsor/settings/${user.UserID}`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              aria-label="Settings"
              title="Settings"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
            <Form method="post" action="/logout">
              <Button variant="secondary" size="sm" type="submit">Sign out</Button>
            </Form>
            <Link
              to={`/sponsor/profile/${user.UserID}/edit`}
              className="flex items-center gap-3 p-1.5 pr-5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 transition-all group shadow-sm"
            >
            <div className="relative">
              <AvatarOrInitials
                profilePicture={userProfilePicture}
                firstName={user.FirstName ?? user.Username}
                lastName={user.LastName ?? user.Username}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800"
                initialsClassName="text-xs"
              />
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 bg-green-500"></span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">{user.Username}</p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">{companyName}</p>
            </div>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 text-left">Overview</h2>
              {/* Row of Square Stat Cards */}
              <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                <StatCard title="Total" value={totalCount} color="text-gray-900 dark:text-white" />
                <StatCard title="Active" value={activeCount} color="text-indigo-600" />
                <StatCard title="Inactive" value={inactiveCount} color="text-gray-400" />
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t dark:border-gray-800">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1 text-left">Analytics</h2>
              <Button 
                variant="secondary" 
                onClick={() => setIsAuditModalOpen(true)} 
                className="w-full py-6 text-lg font-bold bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all shadow-sm"
              >
                Audit Reports
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => navigate("/sponsor/invoices")} 
                className="w-full py-6 text-lg font-bold hover:bg-gray-100 transition-all shadow-sm"
              >
                Invoices
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => navigate("/sponsor/bulk-upload")} 
                className="w-full py-6 text-lg font-bold hover:bg-gray-100 transition-all shadow-sm"
              >
                Bulk Upload
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => navigate("/sponsor/applications")} 
                className="w-full py-6 text-lg font-bold hover:bg-gray-100 transition-all shadow-sm"
              >
                Applications
              </Button>
            </div>
          </aside>

          {/* Main Table Content */}
          <main className="lg:col-span-9 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-5">
                <Input 
                    placeholder="Search name or username..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>
              
              <div className="md:col-span-3">
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <Button variant="primary" className="w-full h-10 shadow-sm" onClick={() => setIsAddUserOpen(true)}>
                  Add New Driver
                </Button>
              </div>
            </div>

            {error && <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-100 text-sm">{error}</div>}

            <div className="bg-white dark:bg-gray-900 shadow-sm rounded-xl border dark:border-gray-800 overflow-hidden">
              <Table data={filteredDrivers} columns={columns} />
              {filteredDrivers.length === 0 && (
                <div className="p-12 text-center text-gray-400 italic">No drivers found matching your criteria.</div>
              )}
            </div>
          </main>
        </div>

        {/* Modal: Register Driver */}
        <Modal isOpen={isAddUserOpen && !(actionData as any)?.success} onClose={() => setIsAddUserOpen(false)} title={`Register Driver to ${companyName}`}>
          <Form method="post" className="space-y-4">
            <Input label="Username" name="username" required />
            <Input label="Email" name="email" type="email" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <Input label="License Number" name="licenseNumber" required />
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create Driver Account</Button>
            </div>
          </Form>
        </Modal>
        
      </div>
    </div>
  );
}

// --- HELPER COMPONENTS ---
function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="aspect-square flex flex-col justify-center items-center p-1 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-lg text-center">
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-tight mb-0.5 truncate w-full">{title}</div>
      <div className={`text-2xl sm:text-3xl lg:text-4xl font-black leading-none tracking-tighter ${color}`}>
        {value}
      </div>
    </div>
  );
}

function resolveProfileImageUrl(profilePicture?: string) {
  if (!profilePicture) return null;

  const trimmed = profilePicture.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      return wrapped ? decodeURIComponent(wrapped) : trimmed;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function getProfileImageCandidates(profilePicture?: string) {
  const trimmed = profilePicture?.trim();
  if (!trimmed) return [] as string[];

  const candidates = [trimmed];
  try {
    const url = new URL(trimmed);
    if (url.hostname === "external-content.duckduckgo.com") {
      const wrapped = url.searchParams.get("u");
      if (wrapped) candidates.push(decodeURIComponent(wrapped));
    }
  } catch {
    return candidates;
  }

  return Array.from(new Set(candidates));
}

function toRenderableImageUrl(profilePicture?: string) {
  const resolved = resolveProfileImageUrl(profilePicture);
  if (!resolved) return null;
  if (resolved.startsWith('data:image')) return resolved;
  if (resolved.startsWith(`${API_URL}/api/images/proxy?url=`)) return resolved;
  return `${API_URL}/api/images/proxy?url=${encodeURIComponent(resolved)}`;
}

function AvatarOrInitials({
  profilePicture,
  firstName,
  lastName,
  className,
  initialsClassName,
}: {
  profilePicture?: string;
  firstName?: string;
  lastName?: string;
  className: string;
  initialsClassName: string;
}) {
  const [imageError, setImageError] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = getProfileImageCandidates(profilePicture);
  const imgSrc = toRenderableImageUrl(sources[sourceIndex]);
  const initials = `${(firstName?.[0] ?? "U").toUpperCase()}${(lastName?.[0] ?? "U").toUpperCase()}`;

  useEffect(() => {
    setImageError(false);
    setSourceIndex(0);
  }, [profilePicture]);

  if (!imgSrc || imageError) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center font-bold ${initialsClassName}`}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt="avatar"
      className={`${className} object-cover`}
      referrerPolicy="no-referrer"
      onError={() => {
        if (sourceIndex < sources.length - 1) {
          setSourceIndex((idx) => idx + 1);
          return;
        }
        setImageError(true);
      }}
    />
  );
}