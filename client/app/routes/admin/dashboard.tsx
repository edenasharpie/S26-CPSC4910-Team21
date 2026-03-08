import { useState, useEffect } from "react";
import { Table, Input, Button, Badge, Modal, Alert } from "~/components";
import { useNavigate, useLoaderData, Form, useActionData, Link } from "react-router";
import { requireAuth } from "~/utils/session.server";
//import { getAllUsers, createUser } from "../../../../server/src/db.js"; // IMPORT SERVER CODE IS NOT ALLOWED, IT WILL NOT WORK IN PROD. you need to use the api.

const BASE_URL = 'http://localhost:5000';

export default function AdminPortal() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("1"); // "1" = Active, "0" = Inactive, "all" = All
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("driver");
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    licenseNumber: '',
    performanceStatus: 'good',
    sponsorCompanyId: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, [statusFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      // Build query string with status filter
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') {
        queryParams.append('activeStatus', statusFilter);
      }
      const queryString = queryParams.toString();
      const url = `${BASE_URL}/api/admin/users${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setError('Failed to fetch users. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const payload: any = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: selectedType,
        activeStatus: 1
      };

      // Add driver-specific fields
      if (selectedType === 'driver') {
        payload.licenseNumber = formData.licenseNumber;
        payload.performanceStatus = formData.performanceStatus;
      }

      // Add sponsor-specific fields
      if (selectedType === 'sponsor' && formData.sponsorCompanyId) {
        payload.sponsorCompanyId = parseInt(formData.sponsorCompanyId);
      }

      const response = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsAddUserOpen(false);
        setFormData({
          username: '',
          email: '',
          firstName: '',
          lastName: '',
          licenseNumber: '',
          performanceStatus: 'good',
          sponsorCompanyId: ''
        });
        setSelectedType('driver');
        fetchUsers();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to create user');
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      setError('Failed to create user. Please try again.');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [statusFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      // Build query string with status filter
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') {
        queryParams.append('activeStatus', statusFilter);
      }
      const queryString = queryParams.toString();
      const url = `${BASE_URL}/api/admin/users${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setError('Failed to fetch users. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const payload: any = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: selectedType,
        activeStatus: 1
      };

      // Add driver-specific fields
      if (selectedType === 'driver') {
        payload.licenseNumber = formData.licenseNumber;
        payload.performanceStatus = formData.performanceStatus;
      }

      // Add sponsor-specific fields
      if (selectedType === 'sponsor' && formData.sponsorCompanyId) {
        payload.sponsorCompanyId = parseInt(formData.sponsorCompanyId);
      }

      const response = await fetch(`${BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setIsAddUserOpen(false);
        setFormData({
          username: '',
          email: '',
          firstName: '',
          lastName: '',
          licenseNumber: '',
          performanceStatus: 'good',
          sponsorCompanyId: ''
        });
        setSelectedType('driver');
        fetchUsers();
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to create user');
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      setError('Failed to create user. Please try again.');
    }
  };

  //Searching for users via name or username
  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = 
      u.Username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.FirstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.LastName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === "All" || u.UserType?.toLowerCase() === typeFilter.toLowerCase();
    
    const matchesStatus = 
      statusFilter === "All" || 
      (statusFilter === "Active" && u.ActiveStatus !== 0) || 
      (statusFilter === "Inactive" && u.ActiveStatus === 0);

    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      key: "Avatar",
      header: "Avatar",
      render: (user: any) => (
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username || user.Username}`}
          alt="avatar"
          className="w-10 h-10 rounded-full"
        />
      ),
    },
    {
      key: "Name",
      header: "User",
      render: (user: any) => (
        <div className="flex flex-col text-left">
          <span className="font-medium text-gray-900 dark:text-white">
            {user.firstName || user.FirstName} {user.lastName || user.LastName}
          </span>
          <span className="text-xs text-gray-500">{user.username || user.Username}</span>
        </div>
      ),
    },
    { 
      key: "Username", 
      header: "Username",
      render: (user: any) => user.username || user.Username
    },
    {
      key: "UserType",
      header: "Account Type",
      render: (user: any) => getAccountTypeBadge(user.accountType || user.UserType),
    },
    {
      key: "Status",
      header: "Status",
      render: (user: any) => {
        const status = user.activeStatus ?? user.ActiveStatus;
        return status === 1 || status === "1" 
          ? <Badge variant="success">Active</Badge> 
          : <Badge variant="default">Inactive</Badge>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (user: any) => {
        const userId = user.id || user.UserID;
        const userType = user.accountType || user.UserType;
        return (
          <div className="flex gap-2">
            {userType?.toLowerCase() === "driver" && (
              <Button size="sm" variant="primary" className="bg-indigo-600" onClick={() => navigate(`/admin/profile/${userId}/points`)}>Points</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/profile/${userId}`)}>Edit</Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-left">{error}</div>
        )}

        <div className="mb-4">
          <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">← Home</Link>
        </div>
        <div className="mb-8 text-left">
          <h1 className="mb-2 text-2xl font-bold">Admin Portal</h1>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-4 flex-wrap items-center">
            <div className="w-full sm:w-64">
              <Input type="search" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div>
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)} 
                className="rounded-md border border-gray-300 dark:border-gray-700 p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 h-10.5"
              >
                <option value="1">Active Users</option>
                <option value="0">Inactive Users</option>
                <option value="all">All Users</option>
              </select>
            </div>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Users" value={users.length} color="text-gray-900" />
          <StatCard title="Drivers" value={users.filter((u: any) => (u.accountType || u.UserType)?.toLowerCase() === "driver").length} color="text-green-600" />
          <StatCard title="Sponsors" value={users.filter((u: any) => (u.accountType || u.UserType)?.toLowerCase() === "sponsor").length} color="text-blue-600" />
          <StatCard title="Admins" value={users.filter((u: any) => (u.accountType || u.UserType)?.toLowerCase() === "admin").length} color="text-red-600" />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading users...</div>
          ) : (
            <Table 
              data={users.filter((u: any) => {
                const username = u.username || u.Username || '';
                return username.toLowerCase().includes(searchQuery.toLowerCase());
              })} 
              columns={columns} 
            />
          )}
        </div>

        <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add New User">
          <form onSubmit={handleCreateUser} className="space-y-4">
            <Input 
              label="Username" 
              name="username" 
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required 
            />
            <Input 
              label="Email" 
              name="email" 
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required 
            />
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="First Name" 
                name="firstName" 
                value={formData.firstName}
                onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                required 
              />
              <Input 
                label="Last Name" 
                name="lastName" 
                value={formData.lastName}
                onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                required 
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-left">Account Type</label>
              <select 
                name="accountType" 
                value={selectedType} 
                onChange={(e) => setSelectedType(e.target.value)} 
                className="w-full rounded-md border p-2 text-sm bg-white dark:bg-gray-800"
              >
                <option value="driver">Driver</option>
                <option value="sponsor">Sponsor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {selectedType === "driver" && (
              <>
                <Input 
                  label="License Number" 
                  name="licenseNumber" 
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({...formData, licenseNumber: e.target.value})}
                  required 
                />
                <div>
                  <label className="text-sm font-medium mb-1 block text-left">Performance Status</label>
                  <select 
                    name="performanceStatus" 
                    value={formData.performanceStatus} 
                    onChange={(e) => setFormData({...formData, performanceStatus: e.target.value})} 
                    className="w-full rounded-md border p-2 text-sm bg-white dark:bg-gray-800"
                  >
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="average">Average</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </>
            )}
            {selectedType === "sponsor" && (
              <Input 
                label="Sponsor Company ID" 
                name="sponsorCompanyId" 
                type="number"
                value={formData.sponsorCompanyId}
                onChange={(e) => setFormData({...formData, sponsorCompanyId: e.target.value})}
                required 
              />
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsAddUserOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Create User</Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
}

function AuditOption({ label, name, value }: { label: string, name: string, value: string }) {
  return (
    <label className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg border dark:border-gray-800 cursor-pointer transition-colors text-left">
      <input type="checkbox" name={name} value={value} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
      <span className="text-xs font-semibold">{label}</span>
    </label>
  );
}

// KScannel's admin-dashboard.tsx file:
// TODO: MERGE THIS IN BY DIFF

//import type { Route } from "./+types/admin-dashboard";
//import { useState } from "react";
//import { useLoaderData, useNavigate } from "react-router";
//import { Table, Input, Button, Badge, Modal, Card } from "~/components";

//// TODO: replace api requests to localhost with an actual variable, or use api.ts

//// 1. DATA TYPES
//interface Invoice {
//  InvoiceID: number;
//  Amount: string;
//  Status: string;
//  DueDate: string;
//  CreatedAt: string;
//  SponsorName: string;
//  OrganizationName: string;
//}

//interface User {
//  id: number;
//  username: string;
//  firstName: string;
//  lastName: string;
//  accountType: string;
//  profilePicture?: string;
//}

//const mockUsers: User[] = [
//  { id: 1, username: "johndoe", firstName: "John", lastName: "Doe", accountType: "Driver" },
//  { id: 2, username: "janesmith", firstName: "Jane", lastName: "Smith", accountType: "Sponsor" },
//  { id: 3, username: "bobwilson", firstName: "Bob", lastName: "Wilson", accountType: "Admin" },
//];

//// 3. LOADER (Fetches invoice data from Express server)
//export async function loader() {
//  try {
//    const response = await fetch("http://localhost:5001/api/admins/invoices");
//    if (!response.ok) throw new Error("Failed to fetch invoices");
//    const invoices = await response.json();
//    return { invoices: invoices as Invoice[] };
//  } catch (error) {
//    console.error("Loader error:", error);
//    return { invoices: [] };
//  }
//}

//export function meta({}: Route.MetaArgs) {
//  return [{ title: "Admin Portal | FleetScore" }];
//}

//export default function AdminPortal() {
//  const { invoices } = useLoaderData<typeof loader>();
//  const navigate = useNavigate();

//  const [reportData, setReportData] = useState([]);
//  const [reportFilter, setReportFilter] = useState({
//    driverId: "",
//    startDate: "",
//    endDate: ""
//  });
//  const [isFetchingReport, setIsFetchingReport] = useState(false);

//  const fetchReport = async (e: React.MouseEvent) => {
//    const { driverId, startDate, endDate } = reportFilter;
//    if (!driverId || !startDate || !endDate) {
//       alert("Please select a driver and date range");
//       return;
//    }
  
//    setIsFetchingReport(true);

//    try {
//    const res = await fetch(`http://localhost:5001/api/admins/driver-report/${driverId}?startDate=${startDate}&endDate=${endDate}`);
//    const data = await res.json();
//    setReportData(data);
//  } catch (error) {
//    console.error("Report fetch error:", error);
//  } finally {
//    setIsFetchingReport(false); 
//  }
//  };

//  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
//  const [isSubmitting, setIsSubmitting] = useState(false);
//  const [searchQuery, setSearchQuery] = useState("");
//  const [form, setForm] = useState({
//    username: "",
//    firstName: "",
//    lastName: "",
//    accountType: "Driver" as "Admin" | "Driver" | "Sponsor",
//  });

//  const invoiceColumns = [
//    {
//      key: "SponsorName",
//      header: "Sponsor",
//      render: (inv: Invoice) => (
//        <div>
//          <div className="font-bold">{inv.SponsorName}</div>
//          <div className="text-xs text-gray-500">{inv.OrganizationName}</div>
//        </div>
//      ),
//    },
//    {
//      key: "Amount",
//      header: "Amount",
//      render: (inv: Invoice) => <span>${parseFloat(inv.Amount).toFixed(2)}</span>,
//    },
//    {
//      key: "Status",
//      header: "Status",
//      render: (inv: Invoice) => (
//        <Badge variant={inv.Status === "PAID" ? "success" : "warning"}>{inv.Status}</Badge>
//      ),
//    },
//    {
//      key: "CreatedAt",
//      header: "Date Issued",
//      render: (inv: Invoice) => new Date(inv.CreatedAt).toLocaleDateString(),
//    },
//  ];

//  const userColumns = [
//    { key: "username", header: "Username" },
//    { key: "firstName", header: "First Name" },
//    { key: "lastName", header: "Last Name" },
//    {
//      key: "accountType",
//      header: "Role",
//      render: (user: User) => (
//        <Badge variant={user.accountType === "Admin" ? "danger" : "info"}>{user.accountType}</Badge>
//      ),
//    },
//  ];

//  const totalPaid = invoices.filter(i => i.Status === "PAID").reduce((a, b) => a + parseFloat(b.Amount), 0);
//  const totalOwed = invoices.filter(i => i.Status !== "PAID").reduce((a, b) => a + parseFloat(b.Amount), 0);

//  return (
//    <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-950">
//      <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

//      {/* SECTION: INVOICES */}
//      <section className="mb-12">
//        <h2 className="text-2xl font-semibold mb-4">Global Invoice Oversight</h2>
//        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
//          <Card className="p-6 border-l-4 border-green-500">
//            <div className="text-gray-500 text-sm">TOTAL REVENUE (PAID)</div>
//            <div className="text-3xl font-bold text-green-600">${totalPaid.toFixed(2)}</div>
//          </Card>
//          <Card className="p-6 border-l-4 border-amber-500">
//            <div className="text-gray-500 text-sm">TOTAL OUTSTANDING</div>
//            <div className="text-3xl font-bold text-amber-600">${totalOwed.toFixed(2)}</div>
//          </Card>
//        </div>
//        <Table data={invoices} columns={invoiceColumns} />
//      </section>

//      <hr className="my-10" />

//      <section className="mb-12 p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200">
//        <h2 className="text-2xl font-semibold mb-4">Driver Fee Reporting</h2>
//        <div className="flex flex-wrap items-end gap-4 mb-6">
//          <div className="flex-1 min-w-[200px]">
//             <label className="block text-sm font-medium mb-1">Driver ID</label>
//             <Input 
//               placeholder="Enter User ID" 
//               value={reportFilter.driverId}
//               onChange={(e) => setReportFilter({...reportFilter, driverId: e.target.value})} 
//             />
//          </div>
//          <Input 
//            type="date" 
//            label="Start Date" 
//            onChange={(e) => setReportFilter({...reportFilter, startDate: e.target.value})} 
//          />
//          <Input 
//            type="date" 
//            label="End Date" 
//            onChange={(e) => setReportFilter({...reportFilter, endDate: e.target.value})} 
//          />
//          <Button onClick={fetchReport}>Generate Report</Button>
//        </div>

//        {reportData.length > 0 ? (
//          <div>
//            <Table data={reportData} columns={invoiceColumns} />
//            <div className="mt-4 p-4 bg-green-50 text-green-800 font-bold rounded-lg border border-green-200">
//              Total Fee for Period: ${reportData.reduce((sum: number, inv: any) => sum + parseFloat(inv.Amount), 0).toFixed(2)}
//            </div>
//          </div>
//        ) : (
//          <p className="text-gray-500 italic">No report generated yet. Select a driver and date range.</p>
//        )}
//      </section>

//      <hr className="my-10" />

//      {/* SECTION: USERS */}
//      <section>
//        <div className="flex justify-between items-center mb-6">
//          <h2 className="text-2xl font-semibold">User Management</h2>
//          <Button onClick={() => setIsAddUserOpen(true)}>Add New User</Button>
//        </div>
//        <Table data={mockUsers} columns={userColumns} />
//      </section>

//      {/* MODAL */}
//      <Modal 
//        isOpen={isAddUserOpen} 
//        onClose={() => setIsAddUserOpen(false)} 
//        title="Create User"
//      >
//        <div className="space-y-4 p-4">
//          <Input label="Username" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} />
//          <Input label="First Name" value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} />
//          <Input label="Last Name" value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} />
//          <Button className="w-full" onClick={() => alert("Saving user...")}>Save User</Button>
//        </div>
//      </Modal>
//    </div>
//  );
//}
