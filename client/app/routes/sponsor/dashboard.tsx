// --- IMPORTS ---
import type { Route } from "./+types/dashboard";
import { useState, useEffect } from "react";
import { Table, Input, Button, Badge, Modal } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
import { getDriversBySponsor, createUser } from "../../../../server/src/db.js"; 

const TARGET_SPONSOR_ID = "123456791";
const TARGET_COMPANY_ID = 17;

// --- LOADER ---
export async function loader() {
  try {
    const drivers = await getDriversBySponsor(TARGET_COMPANY_ID);
    return {
      drivers: Array.isArray(drivers) ? drivers : [],
      error: null
    };
  } catch (error: any) {
    return { drivers: [], error: `Database Error: ${error.message}` };
  }
}

// --- ACTION ---
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  try {
    await createUser({
      Username: formData.get("username") as string,
      FirstName: formData.get("firstName") as string,
      LastName: formData.get("lastName") as string,
      UserType: "Driver",
      ActiveStatus: 1, 
      LicenseNumber: formData.get("licenseNumber") as string,
      SponsorCompanyID: TARGET_COMPANY_ID 
    });
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

// --- MAIN COMPONENT ---
export default function SponsorPortal() {
  const { drivers, error } = useLoaderData<typeof loader>();
  const actionData = useActionData();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // New state for filter
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const navigate = useNavigate();

  // --- STAT CALCULATIONS ---
  const activeCount = drivers.filter((d: any) => d.ActiveStatus === 1).length;
  const inactiveCount = drivers.filter((d: any) => d.ActiveStatus === 0).length;

  useEffect(() => {
    if (actionData?.success) setIsAddUserOpen(false);
  }, [actionData]);

  // --- UPDATED FILTER LOGIC ---
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
      render: (user: any) => (
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.Username}`}
          alt=""
          className="w-10 h-10 rounded-full border border-gray-100 dark:border-gray-800"
        />
      ),
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
          onClick={() => navigate(`/sponsor/profile/${user.UserID}/points`)}
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 hover:border-indigo-400 transition-all"
        >
          <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{user.TotalPoints ?? 0}</span>
          <span className="text-[10px] uppercase tracking-tighter text-indigo-400 font-bold">Manage</span>
        </button>
      )
    },
    {
      key: "edit",
      header: "", 
      render: (user: any) => (
        <div className="flex justify-end pr-4">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/sponsor/profile/${user.UserID}`)}>View Profile</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8 text-left">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="mb-8 border-b pb-6 dark:border-gray-800 flex justify-between items-end">
          <div>
            <Link to="/" className="text-sm font-medium text-blue-600 hover:underline mb-2 block">← Return to Home</Link>
            <h1 className="text-3xl font-extrabold tracking-tight">Sponsor Portal</h1>
            <p className="text-gray-500 text-sm mt-1 font-medium italic">Global Logistics Administration</p>
          </div>

          <button 
            onClick={() => navigate(`/sponsor/profile/${TARGET_SPONSOR_ID}`)}
            className="flex items-center gap-3 p-1.5 pr-5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-indigo-400 transition-all group shadow-sm"
          >
            <div className="relative">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${TARGET_SPONSOR_ID}`}
                alt=""
                className="w-10 h-10 rounded-full bg-gray-100"
              />
              <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 bg-green-500"></span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-gray-900 dark:text-white leading-none">Sponsor Admin</p>
              <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {TARGET_SPONSOR_ID}</p>
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Overview</h2>
              <div className="p-5 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Active Drivers</div>
                <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400">{activeCount}</div>
              </div>
              <div className="p-5 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Inactive Drivers</div>
                <div className="text-3xl font-black text-gray-400 dark:text-gray-500">{inactiveCount}</div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t dark:border-gray-800">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Management</h2>
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
              
              {/* --- NEW STATUS FILTER --- */}
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
        <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Register Driver to Company 17">
          <Form method="post" className="space-y-4">
            <Input label="Username" name="username" required />
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