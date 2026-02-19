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
    username: formData.get("username") as string,
    displayName: formData.get("displayName") as string,
    email: formData.get("email") as string,
    accountType: formData.get("accountType") as string,
    pointToDollarRatio: formData.get("pointToDollarRatio") 
      ? Number(formData.get("pointToDollarRatio")) 
      : null,
  };

  try {
    // This call goes to your RDS endpoint
    await updateUser(userId, updates);
    return redirect(`/admin/profile/${userId}`); 
  } catch (error: any) {
    return { error: error.message };
  }
};

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const actionData = useActionData();
  const [isEditing, setIsEditing] = useState(false);

  // Determine if the user is a Sponsor
  const isSponsor = user.accountType === "Sponsor" || user.account_type === "Sponsor";

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
          
          {/* USERNAME: Editable by all when isEditing is true */}
          <Input 
            label="Username" 
            name="username" 
            defaultValue={user.username} 
            disabled={!isEditing} 
          />

          {/* DISPLAY NAME: Editable by all when isEditing is true */}
          <Input 
            label="Display Name" 
            name="displayName" 
            defaultValue={user.displayName || user.display_name} 
            disabled={!isEditing} 
          />

          {/* EMAIL: Editable by all when isEditing is true */}
          <Input 
            label="Email Address" 
            name="email" 
            defaultValue={user.email} 
            disabled={!isEditing} 
          />

          {/* POINT TO DOLLAR: Only editable if isEditing is true AND user is a Sponsor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Input 
              label="Point to Dollar Ratio" 
              name="pointToDollarRatio" 
              type="number"
              step="0.01"
              defaultValue={user.pointToDollarRatio || user.point_to_dollar_ratio} 
              disabled={!isEditing || !isSponsor} 
              description={isEditing && !isSponsor ? "Only Sponsor accounts can modify this ratio." : ""}
            />
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