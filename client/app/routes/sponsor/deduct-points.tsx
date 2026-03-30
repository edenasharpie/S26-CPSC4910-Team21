import { Form, Link, useActionData } from "react-router";
import { Button, Card } from "~/components";
import { requireAuth } from "~/utils/session.server";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request, ["sponsor"]);
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const res = await fetch(`${API_URL}/api/sponsors/deduct-points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driverId: data.driverId,
      points: Number(data.points),
      reason: data.reason,
      sponsorId: session.UserID
    }),
  });

  return res.json();
}

export default function DeductPoints() {
  const actionData = useActionData();

  return (
    // The "min-h-screen" ensures the page takes up the full height
    // "p-8" adds breathing room so it's not stuck to the edges
    <div className="min-h-screen bg-gray-50 p-8 flex justify-center items-start">
      <div className="w-full max-w-2xl">
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-4">
          &larr; Home
        </Link>

        {/* max-w-2xl prevents it from being a tiny sliver */}
        <Card className="w-full p-8 shadow-lg border-t-4 border-red-600 bg-white">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Deduct Driver Points</h2>
        
        <Form method="post" className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Driver User ID</label>
            {/* TODO: replace raw ID entry with a driver picker once sponsor-affiliated drivers endpoint is finalized */}
            <input 
              name="driverId" 
              placeholder="e.g. 123456834" 
              required 
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Points to Deduct</label>
            <input 
              name="points" 
              type="number" 
              placeholder="50" 
              required 
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none" 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Reason for Deduction</label>
            <textarea 
              name="reason" 
              placeholder="Provide a detailed reason..." 
              required 
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none" 
            />
          </div>
          
          <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white py-3 font-bold rounded-md transition-colors">
            Confirm Deduction
          </Button>

          {actionData?.message && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md">
              {actionData.message}
            </div>
          )}
        </Form>
      </Card>
      </div>
    </div>
  );
}