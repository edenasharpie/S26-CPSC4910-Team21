//IMPORTS
import type { Route } from "./+types/dashboard";
import { useState, useEffect } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData } from "react-router";
import { getAllUsers, createUser } from "../../../../server/src/db.js"; // IMPORT SERVER CODE IS NOT ALLOWED, IT WILL NOT WORK IN PROD. you need to use the api.

//Loads all users for admin dashboard
export async function loader() {
  try {
    const users = await getAllUsers();
    return {
      users: Array.isArray(users) ? users : [],
      error: null
    };
  } catch (error: any) {
    return { users: [], error: `DB Error: ${error.message}` };
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  try {
    await createUser({
      Username: formData.get("username") as string,
      FirstName: formData.get("firstName") as string,
      LastName: formData.get("lastName") as string,
      UserType: formData.get("accountType") as string,
      ActiveStatus: 1,
      LicenseNumber: formData.get("licenseNumber") as string
    });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function AdminPortal() {
  const { users, error } = useLoaderData<typeof loader>();
  const actionData = useActionData();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("Driver");
  const navigate = useNavigate();

  const totalUsers = users.length;
  const driverCount = users.filter((u: any) => u.UserType?.toLowerCase() === "driver").length;
  const sponsorCount = users.filter((u: any) => u.UserType?.toLowerCase() === "sponsor").length;
  const adminCount = users.filter((u: any) => u.UserType?.toLowerCase() === "admin").length;

  useEffect(() => {
    if (actionData?.success) setIsAddUserOpen(false);
  }, [actionData]);

  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = 
      u.Username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.FirstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.LastName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "All" || u.UserType?.toLowerCase() === typeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  const columns = [
    {
      key: "Avatar",
    header: "Avatar",
    render: (user: any) => {
      // Logic: Use the DB image if it exists, otherwise fallback to DiceBear
      const hasCustomPhoto = user.ProfilePicture && user.ProfilePicture.startsWith("data:image");
      const imageSrc = hasCustomPhoto 
        ? user.ProfilePicture 
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.Username}`;

      return (
        <img
          src={imageSrc}
          alt={`${user.Username}'s avatar`}
          className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
          // Error handling: if the Base64 is corrupted, fallback to the seed avatar
          onError={(e) => {
            e.currentTarget.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.Username}`;
          }}
        />
      );
      },
    },
    {
      key: "Name",
      header: "User",
      render: (user: any) => (
        <div className="flex flex-col text-left">
          <span className="font-medium text-gray-900 dark:text-white">
            {user.FirstName} {user.LastName}
          </span>
          <span className="text-xs text-gray-400 font-mono">{user.Username}</span>
        </div>
      ),
    },
    {
      key: "UserType",
      header: "Account Type",
      render: (user: any) => {
        const type = user.UserType?.toLowerCase();
        return (
          <Badge
            variant={
              type === "admin" ? "danger" : 
              type === "sponsor" ? "info" : 
              "success"
            }
          >
            {user.UserType}
          </Badge>
        );
      }
    },
    {
      key: "Points",
      header: "Points",
      render: (user: any) => {
        // Only show point interactions for Drivers
        if (user.UserType?.toLowerCase() !== "driver") return <span className="text-gray-300 pl-4">—</span>;
        
        // This 'TotalPoints' property must come from your database query
        const points = user.TotalPoints ?? 0;

        return (
          <button 
            onClick={() => navigate(`/admin/profile/${user.UserID}/points`)}
            className="group flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 hover:border-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-all active:scale-95"
          >
            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {points}
            </span>
            <span className="text-[10px] uppercase tracking-tighter text-indigo-400 group-hover:text-indigo-600 font-bold">Manage</span>
          </button>
        );
      }
    },
    {
      key: "edit",
      header: "", 
      render: (user: any) => (
        <div className="flex justify-end pr-4">
          <Button 
            size="sm" 
            variant="secondary" 
            className="opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => navigate(`/admin/profile/${user.UserID}`)}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        
        {/* Header Section */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800 flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-3xl font-extrabold tracking-tight">Admin Portal</h1>
            <p className="text-gray-500 text-sm mt-1 font-medium italic">System administration and user oversight.</p>
          </div>

          {/* Enhanced Admin Profile Button */}
          <button 
            onClick={() => navigate(`/admin/profile/123456807`)}
            className="flex items-center gap-3 p-1.5 pr-5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md active:scale-95 transition-all group relative"
            title="My Profile"
          >
            <div className="relative">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin123456807`}
                alt="Admin Avatar"
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800"
              />
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 bg-green-500"></span>
            </div>
            <div className="text-left hidden sm:block">
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">
                  System Admin
                </p>
                <svg className="w-3 h-3 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5 tracking-tight">ID: 123456807</p>
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <aside className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Statistics</h2>
              <StatCard title="Total Users" value={totalUsers} color="text-gray-900 dark:text-white" />
              <StatCard title="Drivers" value={driverCount} color="text-green-600" />
              <StatCard title="Sponsors" value={sponsorCount} color="text-blue-600" />
              <StatCard title="Admins" value={adminCount} color="text-red-600" />
            </div>

            <div className="space-y-3 pt-4 border-t dark:border-gray-800">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Analytics</h2>
              <Button 
                variant="secondary" 
                onClick={() => setIsAuditModalOpen(true)}
                className="w-full py-6 text-lg font-bold bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-all"
              >
                Audit Reports
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => navigate("/admin/invoices")}
                className="w-full py-6 text-lg font-bold hover:bg-gray-100 transition-all"
              >
                Invoices
              </Button>
            </div>
          </aside>

          <main className="lg:col-span-9 space-y-4">
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-6">
                <Input 
                  type="search" 
                  placeholder="Search users..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                />
              </div>

              <div className="col-span-3">
                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="All">All Types</option>
                  <option value="driver">Drivers</option>
                  <option value="sponsor">Sponsors</option>
                  <option value="admin">Admins</option>
                </select>
              </div>

              <div className="col-span-3 flex justify-end">
                <Button variant="primary" className="w-full h-10" onClick={() => setIsAddUserOpen(true)}>
                  Add User
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-100 text-sm">
                {error}
              </div>
            )}

            <div className="card overflow-hidden bg-white dark:bg-gray-900 shadow-md rounded-xl border dark:border-gray-800">
              <Table 
                data={filteredUsers} 
                columns={columns} 
              />
              {filteredUsers.length === 0 && (
                <div className="p-8 text-center text-gray-500 italic">
                  No users found matching your filters.
                </div>
              )}
            </div>
          </main>
        </div>

        <Modal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} title="Audit Report Configuration">
          <Form method="get" action="/audit-logs" className="space-y-4">
            <div className="space-y-2">
              <AuditOption label="Password Changes" name="filter" value="password_changes" />
              <AuditOption label="Login Attempts" name="filter" value="login_attempts" />
              <AuditOption label="Driver Applications" name="filter" value="driver_apps" />
            </div>
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium mb-1">Sponsor Filter</label>
              <select name="sponsorId" className="w-full rounded-md border p-2 text-sm bg-white dark:bg-gray-800">
                <option value="all">All Sponsors</option>
                <option value="1">Global Logistics</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAuditModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Generate</Button>
            </div>
          </Form>
        </Modal>

        <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add New User">
          <Form method="post" className="space-y-4">
            <Input label="Username" name="username" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Account Type</label>
              <select 
                name="accountType" 
                value={selectedType} 
                onChange={(e) => setSelectedType(e.target.value)} 
                className="w-full rounded-md border p-2 text-sm bg-white dark:bg-gray-800"
              >
                <option value="Driver">Driver</option>
                <option value="Sponsor">Sponsor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            {selectedType === "Driver" && <Input label="License Number" name="licenseNumber" required />}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create User</Button>
            </div>
          </Form>
        </Modal>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="p-5 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-xl text-left transition-all">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function AuditOption({ label, name, value }: { label: string, name: string, value: string }) {
  return (
    <label className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer transition-colors">
      <input type="checkbox" name={name} value={value} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}