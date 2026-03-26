import { useState, useEffect } from "react";
import { useParams, useLoaderData, Form, useActionData, Link, useNavigate, redirect } from "react-router"; 
import type { Route } from "./+types/edit";
import { Input, Button, Alert } from "~/components";
import { requireAuth } from "~/utils/session.server";

const BASE_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request, ["admin"]);
  const res = await fetch(`${BASE_URL}/api/admin/users/${params.id}`);
  if (!res.ok) throw new Response("User not found", { status: 404 });
  const user = await res.json();
  return { user };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request, ["admin"]);
  const formData = await request.formData();
  const userId = params.id;
  const intent = formData.get("intent");

  if (intent === "delete") {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json();
        return { error: body.error ?? 'Delete failed' };
      }
      return redirect("/admin/dashboard");
    } catch (error: any) {
      return { error: error.message };
    }
  }

  const updates = {
    Username: formData.get("Username"),
    Email: formData.get("Email"),
    Phone: formData.get("Phone"),
    PassHash: formData.get("PassHash"),
    FirstName: formData.get("FirstName"),
    MiddleName: formData.get("MiddleName"),
    LastName: formData.get("LastName"),
    Pronouns: formData.get("Pronouns"),
    ProfilePicture: formData.get("ProfilePicture"),
    Bio: formData.get("Bio"),
    UserType: formData.get("UserType"),
    ActiveStatus: formData.get("ActiveStatus") === "1" ? 1 : 0,
  };

  try {
    const res = await fetch(`${BASE_URL}/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json();
      return { error: body.error ?? 'Update failed' };
    }
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function EditUserProfile() {
  const { id } = useParams();
  const { user: loaderUser } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(normalizeUser(loaderUser));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [profileImageError, setProfileImageError] = useState(false);
  const [profileImageSourceIndex, setProfileImageSourceIndex] = useState(0);

  useEffect(() => {
    setUser(normalizeUser(loaderUser));
    setLoading(false);
    setError(null);
    setProfileImageError(false);
    setProfileImageSourceIndex(0);
  }, [loaderUser]);

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
      setUser(normalizeUser(data));
      setProfileImageError(false);
      setProfileImageSourceIndex(0);
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

  const handleEditSaveClick = () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const form = document.getElementById("edit-form") as HTMLFormElement | null;
    form?.requestSubmit();
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

  const profileImageCandidates = getProfileImageCandidates(user.profilePicture);
  const activeProfileImage = toRenderableImageUrl(profileImageCandidates[profileImageSourceIndex]);

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
          {activeProfileImage && !profileImageError ? (
            <img 
              key={user.profilePicture}
              src={activeProfileImage}
              alt="Profile"
              referrerPolicy="no-referrer"
              onError={() => {
                if (profileImageSourceIndex < profileImageCandidates.length - 1) {
                  setProfileImageSourceIndex((idx) => idx + 1);
                  return;
                }
                setProfileImageError(true);
              }}
              className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border border-gray-200 dark:border-gray-700 shadow-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center text-2xl font-bold">
              {`${(user.firstName?.[0] ?? "U").toUpperCase()}${(user.lastName?.[0] ?? "U").toUpperCase()}`}
            </div>
          )}
        </div>
        
        <div className="flex-1 text-left">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</h1>
          <div className="flex gap-6 mt-2 text-xs text-gray-400 dark:text-gray-500">
            <span><strong>Last Login:</strong> {user.lastLogin || "Never"}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {isEditing && (
            <Button 
              type="button" 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete User
            </Button>
          )}

          {isEditing && (
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          )}

          <Button
            type="button"
            onClick={handleEditSaveClick}
            variant="primary"
          >
            {isEditing ? "Save" : "Edit"}
          </Button>
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
    : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 opacity-100";
}

function normalizeUser(raw: any) {
  if (!raw) return null;
  return {
    userId: raw.userId ?? raw.UserID,
    username: raw.username ?? raw.Username ?? "",
    email: raw.email ?? raw.Email ?? "",
    phone: raw.phone ?? raw.Phone ?? "",
    firstName: raw.firstName ?? raw.FirstName ?? "",
    middleName: raw.middleName ?? raw.MiddleName ?? "",
    lastName: raw.lastName ?? raw.LastName ?? "",
    pronouns: raw.pronouns ?? raw.Pronouns ?? "",
    profilePicture: raw.profilePicture ?? raw.ProfilePicture ?? "",
    bio: raw.bio ?? raw.Bio ?? "",
    userType: raw.userType ?? raw.UserType ?? "",
    accountType: raw.accountType ?? raw.userType ?? raw.UserType ?? "",
    activeStatus: raw.activeStatus ?? raw.ActiveStatus ?? 1,
    lastLogin: raw.lastLogin ?? raw.LastLogin ?? null,
  };
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
  if (resolved.startsWith(`${BASE_URL}/api/images/proxy?url=`)) return resolved;
  return `${BASE_URL}/api/images/proxy?url=${encodeURIComponent(resolved)}`;
}