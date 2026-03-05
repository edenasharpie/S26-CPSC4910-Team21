import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router"; 
import { Input, Button } from "~/components";

const BASE_URL = 'http://localhost:5000';

export default function EditUserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('User not found');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUser(data);
    } catch (error: any) {
      console.error('Error fetching user:', error);
      setError(error.message || 'Failed to fetch user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      setSuccessMessage(null);
      const formData = new FormData(e.target as HTMLFormElement);
      
      const updates: any = {
        username: formData.get('Username'),
        email: formData.get('Email'),
        phone: formData.get('Phone'),
        firstName: formData.get('FirstName'),
        middleName: formData.get('MiddleName'),
        lastName: formData.get('LastName'),
        pronouns: formData.get('Pronouns'),
        profilePicture: formData.get('ProfilePicture'),
        bio: formData.get('Bio'),
        activeStatus: formData.get('ActiveStatus') === '1' ? 1 : 0,
      };

      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setSuccessMessage('Profile updated successfully');
        setIsEditing(false);
        fetchUser(); // Refresh user data
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to update user');
      }
    } catch (error: any) {
      console.error('Error updating user:', error);
      setError('Failed to update user. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!confirm("Permanently delete this user?")) return;
    
    try {
      setError(null);
      const response = await fetch(`${BASE_URL}/api/admin/users/${id}`, {
        method: 'DELETE'
      });

      if (response.ok || response.status === 204) {
        navigate('/admin/dashboard');
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to delete user');
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="text-center text-gray-500">Loading user data...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Link to="/admin/dashboard" className="text-blue-600 hover:underline">← Back to Dashboard</Link>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      
      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Link 
          to="/admin/dashboard" 
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          ← Back to Dashboard
        </Link>
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Home</Link>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="p-3 bg-green-50 text-green-700 text-sm rounded border border-green-200">
          ✓ {successMessage}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-8 pb-6 border-b border-gray-100 dark:border-gray-800">
        <div className="relative">
          <img 
            key={user.profilePicture}
            src={
              user.profilePicture && (user.profilePicture.includes('http') || user.profilePicture.startsWith('data:image'))
                ? user.profilePicture 
                : `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}&background=random&size=128`
            } 
            alt="Profile" 
            className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900"
          />
        </div>
        
        <div className="flex-1 text-left">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</h1>
          <div className="flex gap-6 mt-2 text-xs text-gray-400 dark:text-gray-500">
            <span><strong>Last Login:</strong> {user.lastLogin || "Never"}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!isEditing ? (
            <Button type="button" onClick={() => setIsEditing(true)} variant="primary">
              Edit Profile
            </Button>
          ) : (
            <>
              <Button 
                type="button" 
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete User
              </Button>

              <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-form" variant="primary">
                Update
              </Button>
            </>
          )}
        </div>
      </div>

      <form method="post" id="edit-form" onSubmit={handleUpdate} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
           <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Personal Info</h2>
            <div className="flex gap-2">
              <Input label="First Name" name="FirstName" defaultValue={user.firstName} disabled={!isEditing} className={getFieldClass(isEditing)} />
              <Input label="Middle" name="MiddleName" defaultValue={user.middleName} disabled={!isEditing} className={getFieldClass(isEditing)} />
              <Input label="Last Name" name="LastName" defaultValue={user.lastName} disabled={!isEditing} className={getFieldClass(isEditing)} />
            </div>
            <Input label="Pronouns" name="Pronouns" defaultValue={user.pronouns} disabled={!isEditing} className={getFieldClass(isEditing)} />
            <Input label="Bio" name="Bio" defaultValue={user.bio} disabled={!isEditing} className={getFieldClass(isEditing)} />
            <Input label="Profile Picture URL" name="ProfilePicture" defaultValue={user.profilePicture} disabled={!isEditing} className={getFieldClass(isEditing)} />
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Account & Security</h2>
            <Input label="Username" name="Username" defaultValue={user.username} disabled={!isEditing} className={getFieldClass(isEditing)} />
            <Input label="Email" name="Email" defaultValue={user.email} disabled={!isEditing} className={getFieldClass(isEditing)} />
            <Input label="Phone" name="Phone" defaultValue={user.phone} disabled={!isEditing} className={getFieldClass(isEditing)} />
          </div>
        </div>

        {/* System Settings */}
        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-6 text-left">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">User Type</label>
            <div className="w-full p-2 border rounded h-10.5 bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed">
              {user.accountType}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Status</label>
            <select 
              name="ActiveStatus" 
              defaultValue={user.activeStatus} 
              disabled={!isEditing}
              className={`w-full p-2 border rounded transition-all h-10.5 outline-none ${getFieldClass(isEditing)}`}
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </div>
        </div>
      </form>
    </div>
    </div>
  );
}

function getFieldClass(isEditing: boolean) {
  return isEditing
    ? "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 shadow-sm text-gray-900 dark:text-gray-100 opacity-100"
    : "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-100 pointer-events-none appearance-none";
}