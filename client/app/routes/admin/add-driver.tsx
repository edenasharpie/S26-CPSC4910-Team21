import { Form, Link, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { Card, Button } from "~/components";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

export async function action({ request }: ActionFunctionArgs) {
  await requireAuth(request, ["admin"]);
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const res = await fetch(`${API_URL}/api/admin/add-driver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) return { error: "Could not create driver. Check if ID/Email is unique." };
  return redirect("/admin/audit-logs"); 
}

export default function AddDriver() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-4">
        &larr; Home
      </Link>
      <Card className="p-8 shadow-xl border-t-4 border-indigo-600">
        <h1 className="text-2xl font-bold mb-6">Register New Driver</h1>
        
        <Form method="post" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input name="firstName" placeholder="First Name" required className="input-style" />
            <input name="lastName" placeholder="Last Name" required className="input-style" />
          </div>
          <input name="email" type="email" placeholder="Email Address" required className="input-style" />
          <input name="password" type="password" placeholder="Temporary Password" required className="input-style" />
          <hr className="my-4" />
          <input name="licenseNumber" placeholder="Driver License Number" required className="input-style" />

          {actionData?.error && <p className="text-red-500 text-sm">{actionData.error}</p>}
          
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3">
            Create Driver Account
          </Button>
        </Form>
      </Card>
    </div>
  );
}