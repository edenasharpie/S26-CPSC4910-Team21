import type { Route } from "./+types/edit";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Input, Card } from "~/components";

// This loads the data before the page renders
export async function loader({ params }: Route.LoaderArgs) {
  const userId = params.id;
  // In a real app, fetch user from DB: const user = await db.user.findUnique({ where: { id: userId } })
  return { userId };
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
  const { userId } = loaderData;
  const navigate = useNavigate();

  // Local state for the form (initialized with mock data or loader data)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving user:", userId, form);
    // After saving, go back to the dashboard
    navigate("/admin-dashboard");
  };

  return (
    <div className="container-padding section-spacing">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Edit User</h1>
            <p className="text-gray-500">Updating Profile ID: {userId}</p>
          </div>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>

        <div className="card p-6 bg-white dark:bg-gray-900 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="John"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              <Input
                label="Last Name"
                placeholder="Doe"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>

            <Input
              label="Email Address"
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}