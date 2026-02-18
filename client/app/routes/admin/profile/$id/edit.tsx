import { useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/edit";
import { Input, Button, Badge } from "~/components";

// @ts-ignore
import { getUserById } from "../../../../../../server/src/db.server";

export async function loader({ params }: Route.LoaderArgs) {
  // Now that .env is fixed, this will successfully connect to your remote DB
  const user = await getUserById(Number(params.id)); 
  if (!user) throw new Response("Not Found", { status: 404 });
  return { user };
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
  const { user, status } = loaderData;
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Test Status Indicator */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-mono text-gray-500">Remote Status:</span>
        <Badge variant={status === "Connected" ? "success" : "destructive"}>
          {status}
        </Badge>
      </div>

      {!user ? (
        <div className="p-10 border-2 border-dashed border-red-200 text-center">
          <p className="text-red-500 font-bold">Failed to load data from remote server.</p>
          <p className="text-sm text-gray-500">Check your terminal for .env pathing errors.</p>
        </div>
      ) : (
        <div className="card p-6 bg-white shadow-md rounded-lg">
          <h1 className="text-2xl font-bold mb-6">Edit {user.displayName || user.username}</h1>
          <div className="space-y-4">
            <Input label="Name" defaultValue={user.displayName} disabled={!isEditing} />
            <Input label="Email" defaultValue={user.email} disabled={!isEditing} />
            <Button onClick={() => setIsEditing(!isEditing)}>
                {isEditing ? "Cancel" : "Test Edit"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}