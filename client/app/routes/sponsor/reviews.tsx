import { useLoaderData, useFetcher } from "react-router";
import { Button } from "~/components/Button"; // Adjust based on your UI library

export async function loader() {
  const response = await fetch("http://localhost:5001/api/reviews/sponsor-list");
  if (!response.ok) throw new Error("Failed to load reviews");
  return response.json();
}

export default function SponsorReviewsPage() {
  const { reviews } = useLoaderData();
  const fetcher = useFetcher();

  const toggleVisibility = (reviewId: number) => {
    // This calls your NEW reviews.js PATCH method
    fetcher.submit(null, {
      method: "patch",
      action: `/api/reviews/toggle-visibility/${reviewId}`,
    });
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Driver Reviews</h1>
      
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4 border-b">Driver</th>
              <th className="p-4 border-b">Rating</th>
              <th className="p-4 border-b">Comment</th>
              <th className="p-4 border-b">Status</th>
              <th className="p-4 border-b text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r: any) => (
              <tr key={r.ReviewID} className="hover:bg-gray-50">
                <td className="p-4 border-b font-medium">{r.DriverName}</td>
                <td className="p-4 border-b">{"⭐".repeat(r.Rating)}</td>
                <td className="p-4 border-b text-gray-600 italic">"{r.ReviewBody}"</td>
                <td className="p-4 border-b">
                  <span className={`px-2 py-1 rounded text-xs ${r.IsVisible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.IsVisible ? 'Visible' : 'Hidden'}
                  </span>
                </td>
                <td className="p-4 border-b text-right">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => toggleVisibility(r.ReviewID)}
                  >
                    {r.IsVisible ? "Hide" : "Show"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}