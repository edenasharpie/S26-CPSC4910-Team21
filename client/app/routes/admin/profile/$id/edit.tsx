import { useState } from "react";
import { useLoaderData, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/edit";
import { Input, Button } from "~/components";

// Switched import to db.js
// @ts-ignore
import { getUserById, updateUser } from "../../../../../../server/src/db";

export async function loader({ params }: Route.LoaderArgs) {
  // If this fails, the page will now show the actual error instead of freezing
  const user = await getUserById(Number(params.id));
  
  if (!user) {
    throw new Response("User Not Found in AWS Database", { status: 404 });
  }
  
  return { user };
}

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const userId = Number(params.id);
  
  const updates = {
    displayName: formData.get("displayName") as string,
    email: formData.get("email") as string,
  };

  try {
    await updateUser(userId, updates);
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