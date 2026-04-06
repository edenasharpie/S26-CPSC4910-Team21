import { useLoaderData, Form, redirect, Link } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireAuth } from "~/utils/session.server";
import { getApiBaseUrl } from "~/utils/api-url";

const API_URL = getApiBaseUrl();

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAuth(request, ["sponsor"]);
  const { userId } = params; // This matches the $userId in your filename

  const res = await fetch(`${API_URL}/api/sponsors/user/${userId}`);
  
  if (!res.ok) {
    throw new Response("User not found", { status: 404 });
  }

  const user = await res.json();
  return { user };
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAuth(request, ["sponsor"]);
  const { userId } = params;
  const formData = await request.formData();
  
  const updates = {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  };

  const res = await fetch(`${API_URL}/api/sponsors/user/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    return { error: "Could not save changes." };
  }

  return redirect("/sponsor/manage-users");
}

export default function EditUser() {
  const { user } = useLoaderData() as { user: any };

  return (
    <div className="min-h-screen bg-[#0f172a] p-12">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-10 shadow-2xl">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-4">
          &larr; Home
        </Link>
        
        {/* Header - Darkened to Slate-900 */}
        <h1 className="text-3xl font-extrabold text-slate-500 mb-1 border-b pb-4">
          Edit Profile
        </h1>

        <Form method="post" className="space-y-6">
          {/* Read-Only ID Field */}
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
              User ID
            </label>
            <input 
              type="text" 
              value={user.UserID} 
              readOnly 
              className="w-full bg-slate-100 text-slate-500 border-none rounded-xl p-3 font-mono cursor-not-allowed"
            />
          </div>

          {/* First Name Field */}
          <div>
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">
              First Name
            </label>
            <input 
              type="text" 
              name="firstName"
              defaultValue={user.FirstName} 
              className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 rounded-xl p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          </div>

          {/* Last Name Field */}
          <div>
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">
              Last Name
            </label>
            <input 
              type="text" 
              name="lastName"
              defaultValue={user.LastName} 
              className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 rounded-xl p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input 
              type="email" 
              name="email"
              defaultValue={user.Email} 
              className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 rounded-xl p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex gap-4">
            <button 
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-transform active:scale-95"
            >
              Save Changes
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}