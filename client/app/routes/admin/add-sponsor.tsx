import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { Card, Button } from "~/components";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const res = await fetch("http://localhost:5001/api/admin/add-sponsor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) return { error: "Failed to create sponsor. Check if email is unique." };
  return redirect("/admin/audit-logs"); 
}

export default function AddSponsor() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Card className="p-8 shadow-xl border-t-4 border-green-600">
        <h1 className="text-2xl font-bold mb-6">Register New Sponsor</h1>
        
        <Form method="post" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input name="firstName" placeholder="First Name" required className="p-2 border rounded" />
            <input name="lastName" placeholder="Last Name" required className="p-2 border rounded" />
          </div>
          <input name="email" type="email" placeholder="Email Address" required className="w-full p-2 border rounded" />
          <input name="password" type="password" placeholder="Temporary Password" required className="w-full p-2 border rounded" />
          
          <div className="pt-4 border-t">
            <label className="block text-sm font-medium mb-1 text-gray-600">Assign to Company ID</label>
            <input name="companyID" placeholder="e.g. 101" required className="w-full p-2 border rounded bg-gray-50" />
          </div>

          {actionData?.error && <p className="text-red-500 text-sm italic">{actionData.error}</p>}
          
          <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-3 mt-4">
            Create Sponsor Account
          </Button>
        </Form>
      </Card>
    </div>
  );
}