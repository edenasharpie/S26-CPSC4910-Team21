import { useState, useEffect } from "react";
import { useLoaderData, Form, useActionData, Link, useNavigate, redirect } from "react-router"; 
import type { Route } from "./+types/edit";
import { Input, Button, Alert } from "~/components";
import { getUserById, updateUser, deleteUser } from "../../../../../../server/src/db";

export async function loader({ params }: Route.LoaderArgs) {
  const user = await getUserById(Number(params.id));
  if (!user) throw new Response("User not found", { status: 404 });
  return { user };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = Number(params.id);
  const intent = formData.get("intent");

  if (intent === "delete") {
    try {
      await deleteUser(userId);
      // Hard redirect to the dashboard after a successful delete
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
    await updateUser(userId, updates);
    return { success: true };
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function EditUserProfile() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setIsEditing(false);
    }
    // No longer need deleted redirect here since the action handles it via 'redirect'
  }, [actionData]);

  const getFieldClass = () => {
    return isEditing
      ? "bg-white border-gray-300 shadow-sm text-gray-900 opacity-100"
      : "bg-gray-100 border-transparent text-gray-500 cursor-not-allowed opacity-100 pointer-events-none appearance-none";
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      
      {/* Navigation - Fixed to explicit path */}
      <div className="flex justify-between items-center">
        <Link 
          to="/admin/dashboard" 
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-8 pb-6 border-b border-gray-100">
        <div className="relative">
          <img 
            key={user.ProfilePicture}
            src={
              user.ProfilePicture && (user.ProfilePicture.includes('http') || user.ProfilePicture.startsWith('data:image'))
                ? user.ProfilePicture 
                : `https://ui-avatars.com/api/?name=${user.FirstName}+${user.LastName}&background=random&size=128`
            } 
            alt="Profile" 
            className="w-24 h-24 rounded-full object-cover border border-gray-200 shadow-sm bg-white"
          />
        </div>
        
        <div className="flex-1 text-left">
          <h1 className="text-3xl font-bold text-gray-900">{user.FirstName} {user.LastName}</h1>
          <div className="flex gap-6 mt-2 text-xs text-gray-400">
            <span><strong>Last Login:</strong> {user.LastLogin || "Never"}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!isEditing ? (
            <Button type="button" onClick={() => setIsEditing(true)} variant="primary">
              Edit Profile
            </Button>
          ) : (
            <>
              <Form method="post" onSubmit={(e) => !confirm("Permanently delete this user?") && e.preventDefault()}>
                <input type="hidden" name="intent" value="delete" />
                <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">
                  Delete User
                </Button>
              </Form>

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

      <Form method="post" id="edit-form" className="space-y-8">
        {/* Success Alert */}
        {actionData?.success && (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded border border-green-200">
            ✓ Profile updated successfully.
          </div>
        )}

        {/* ... (Grid and Input fields remain the same as previous) ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
           <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Personal Info</h2>
            <div className="flex gap-2">
              <Input label="First Name" name="FirstName" defaultValue={user.FirstName} disabled={!isEditing} className={getFieldClass()} />
              <Input label="Middle" name="MiddleName" defaultValue={user.MiddleName} disabled={!isEditing} className={getFieldClass()} />
              <Input label="Last Name" name="LastName" defaultValue={user.LastName} disabled={!isEditing} className={getFieldClass()} />
            </div>
            <Input label="Pronouns" name="Pronouns" defaultValue={user.Pronouns} disabled={!isEditing} className={getFieldClass()} />
            <Input label="Bio" name="Bio" defaultValue={user.Bio} disabled={!isEditing} className={getFieldClass()} />
            <Input label="Profile Picture URL" name="ProfilePicture" defaultValue={user.ProfilePicture} disabled={!isEditing} className={getFieldClass()} />
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest text-left">Account & Security</h2>
            <Input label="Username" name="Username" defaultValue={user.Username} disabled={!isEditing} className={getFieldClass()} />
            <Input label="Email" name="Email" defaultValue={user.Email} disabled={!isEditing} className={getFieldClass()} />
            <Input label="Phone" name="Phone" defaultValue={user.Phone} disabled={!isEditing} className={getFieldClass()} />
            <Input label="Password Hash" name="PassHash" type="password" defaultValue={user.PassHash} disabled={!isEditing} className={getFieldClass()} />
          </div>
        </div>

        {/* System Settings - Fixed Dropdowns */}
        <div className="pt-6 border-t border-gray-100 flex flex-col md:flex-row gap-6 text-left">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">User Type</label>
            <select 
              name="UserType" 
              defaultValue={user.UserType} 
              className={`w-full p-2 border rounded transition-all h-[42px] outline-none ${getFieldClass()}`}
            >
              <option value="driver">Driver</option>
              <option value="sponsor">Sponsor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Status</label>
            <select 
              name="ActiveStatus" 
              defaultValue={user.ActiveStatus} 
              className={`w-full p-2 border rounded transition-all h-[42px] outline-none ${getFieldClass()}`}
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </div>
        </div>
      </Form>
    </div>
  );
}