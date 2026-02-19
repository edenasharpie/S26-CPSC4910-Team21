import { useState } from "react";
import { useLoaderData, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/edit";
import { Input, Button } from "~/components";

// Ensure this path matches your working db.js
// @ts-ignore
import { getUserById, updateUser } from "../../../../../../server/src/db";

export async function loader({ params }: Route.LoaderArgs) {
  const user = await getUserById(Number(params.id));
  
  if (!user) {
    throw new Response("User not found in RDS", { status: 404 });
  }

  // Map database snake_case to React camelCase if necessary
  return { 
    user: {
      ...user,
      displayName: user.displayName || user.display_name, // Support both formats
      accountType: user.accountType || user.account_type || "Driver"
    }
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = Number(params.id);
  
  const updates = {
    username: formData.get("username") as string, // Added username
    displayName: formData.get("displayName") as string,
    email: formData.get("email") as string,
    accountType: formData.get("accountType") as string, // Added accountType
  };

  try {
    await updateUser(userId, updates);
    // Redirecting back to the profile view after successful AWS update
    return redirect(`/admin/profile/${userId}`); 
  } catch (error: any) {
    return { error: error.message };
  }
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const actionData = useActionData();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Form method="post" className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Admin Edit: {user.username}
          </h1>
          <Button type="button" variant="secondary" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? "Cancel" : "Enable Editing"}
          </Button>
        </div>

        {actionData?.error && (
          <div className="p-3 bg-red-100 text-red-700 rounded border border-red-200">
            {actionData.error}
          </div>
        )}

        <div className="grid gap-4 bg-white dark:bg-gray-900 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          {/* New Username Field */}
          <Input 
            label="Username" 
            name="username" 
            defaultValue={user.username} 
            disabled={!isEditing} 
          />

          <Input 
            label="Display Name" 
            name="displayName" 
            defaultValue={user.displayName} 
            disabled={!isEditing} 
          />

          <Input 
            label="Email Address" 
            name="email" 
            defaultValue={user.email} 
            disabled={!isEditing} 
          />

          {/* New Account Type Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Account Type</label>
            <select
              name="accountType"
              disabled={!isEditing}
              defaultValue={user.accountType || "Driver"}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 dark:border-gray-800 dark:bg-gray-950 dark:ring-offset-gray-950"
            >
              <option value="Driver">Driver</option>
              <option value="Sponsor">Sponsor</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          
          {isEditing && (
            <Button type="submit" className="w-full mt-4" variant="primary">
              Push Updates to AWS
            </Button>
          )}
        </div>
      </Form>
    </div>
  );
}