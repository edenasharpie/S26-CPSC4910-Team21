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

  const getAccountTypeBadge = (userType: string) => {
    const type = userType?.toLowerCase() || "";
    switch (type) {
      case "admin": return <Badge variant="danger">Admin</Badge>;
      case "sponsor": return <Badge variant="info">Sponsor</Badge>;
      case "driver": return <Badge variant="success">Driver</Badge>;
      default: return <Badge variant="default">{userType || "N/A"}</Badge>;
    }
  };

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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/admin/invoices")}>View Invoices</Button>
            <Button variant="primary" onClick={() => setIsAddUserOpen(true)}>Add User</Button>
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

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className="card p-6 border dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-lg text-left">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}