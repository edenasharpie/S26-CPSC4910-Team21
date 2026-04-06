import type { Route } from "./+types/edit";
import { useLoaderData, Form, Link, useNavigate } from "react-router";
import { Button, Input, Card } from "~/components";
import { getApiBaseUrl } from "~/utils/api-url";
import { requireAuth } from "~/utils/session.server";

const API_URL = getApiBaseUrl();

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const sponsorUserId = user.UserID;
  const driverId = params.id;

  try {
    // First, get the sponsor's company
    const companyRes = await fetch(`${API_URL}/api/sponsors/user/${sponsorUserId}`);
    if (!companyRes.ok) {
      throw new Response("Could not determine sponsor company", { status: 500 });
    }
    const company = await companyRes.json();
    const companyId = company.sponsorCompanyId;

    // Now fetch the driver
    const res = await fetch(`${API_URL}/api/sponsors/${sponsorUserId}/drivers/${driverId}`);
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to load driver ${driverId}:`, res.status, errorText);
      throw new Response("Driver not found", { status: 404 });
    }

    const driver = await res.json();
    return { driver, sponsorUserId, companyId };
  } catch (error) {
    console.error('Loader error:', error);
    throw error;
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = requireAuth(request, ["sponsor"]);
  const sponsorUserId = user.UserID;
  const formData = await request.formData();
  const driverId = params.id;

  try {
    const res = await fetch(`${API_URL}/api/sponsors/${sponsorUserId}/drivers/${driverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email: formData.get("email"),
        phone: formData.get("phone"),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      return { success: false, error: (errorBody as any).error ?? "Failed to update driver" };
    }

    return { success: true, error: null };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export default function SponsorProfileEdit() {
  const { driver } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Link to="/" className="text-sm text-blue-600 hover:underline mb-2 block">
          ← Home
        </Link>
        <Link to="/sponsor/dashboard" className="text-sm text-blue-600 hover:underline mb-4 block">
          ← Back to Dashboard
        </Link>

        <Card>
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Driver Profile: {driver.FirstName} {driver.LastName}</h1>

            <Form method="post" className="space-y-4">
              <Input label="First Name" name="firstName" defaultValue={driver.FirstName} required />
              <Input label="Last Name" name="lastName" defaultValue={driver.LastName} required />
              <Input label="Email" name="email" type="email" defaultValue={driver.Email} required />
              <Input label="Phone" name="phone" defaultValue={driver.Phone || ""} />

              <div className="flex gap-2 pt-4">
                <Button type="submit" variant="primary">Save Changes</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/sponsor/dashboard")}
                >
                  Cancel
                </Button>
              </div>
            </Form>

            <div className="mt-6 pt-6 border-t">
              <Link
                to={`/sponsor/profile/${driver.UserID}/points`}
                className="text-indigo-600 hover:underline font-medium"
              >
                View Point Transactions →
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
