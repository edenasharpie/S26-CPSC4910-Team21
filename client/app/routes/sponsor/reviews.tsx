import { useLoaderData, useFetcher, Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/Button";
import { Alert } from "~/components/Alert";
import { createApiClient } from "~/utils/api";
import { requireAuth } from "~/utils/session.server";
import type { Route } from "./+types/reviews";

export async function loader({ request }: Route.LoaderArgs) {
  const user = requireAuth(request, ["sponsor"]);
  return { user };
}

interface SponsorReview {
  ReviewID: number;
  DriverID: number;
  ItemID: number;
  Rating: number;
  ReviewBody: string;
  IsVisible: number;
  Timestamp: string;
  DriverName: string;
}

export default function SponsorReviewsPage() {
  const { user } = useLoaderData<typeof loader>();
  const api = useMemo(() => createApiClient({ id: user.UserID, role: "sponsor" }), [user.UserID]);

  const [reviews, setReviews] = useState<SponsorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingReviewId, setUpdatingReviewId] = useState<number | null>(null);

  const fetchReviews = async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await api.get("/reviews");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load reviews");
      }

      const data = await response.json();
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (fetchError: any) {
      setError(fetchError.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const toggleVisibility = async (reviewId: number) => {
    try {
      setUpdatingReviewId(reviewId);
      setError(null);

      const response = await api.patch(`/reviews/${reviewId}/visibility`, {});
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update review visibility");
      }

      await fetchReviews();
    } catch (updateError: any) {
      setError(updateError.message || "Failed to update review visibility");
    } finally {
      setUpdatingReviewId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6"
      >
        ← Home
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Driver Reviews</h1>
        <p className="text-gray-600 dark:text-gray-300">Moderate reviews left by drivers for your company catalog items.</p>
      </div>

      {error && (
        <Alert
          variant="error"
          title="Error"
          message={error}
          dismissible
          onDismiss={() => setError(null)}
        />
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">Driver</th>
              <th className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">Rating</th>
              <th className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">Comment</th>
              <th className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">Status</th>
              <th className="p-4 border-b border-gray-200 dark:border-gray-700 text-right text-gray-800 dark:text-gray-200">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && reviews.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500 dark:text-gray-400" colSpan={5}>
                  No reviews found for this sponsor company.
                </td>
              </tr>
            )}

            {reviews.map((review) => (
              <tr key={review.ReviewID} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="p-4 border-b border-gray-200 dark:border-gray-700 font-medium text-gray-900 dark:text-gray-100">{review.DriverName}</td>
                <td className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">{"*".repeat(review.Rating)}</td>
                <td className="p-4 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 italic">"{review.ReviewBody}"</td>
                <td className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      review.IsVisible
                        ? "border border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "border border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                    }`}
                  >
                    {review.IsVisible ? "Visible" : "Hidden"}
                  </span>
                </td>
                <td className="p-4 border-b border-gray-200 dark:border-gray-700 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={updatingReviewId === review.ReviewID}
                    onClick={() => toggleVisibility(review.ReviewID)}
                  >
                    {updatingReviewId === review.ReviewID
                      ? "Saving..."
                      : review.IsVisible
                      ? "Hide"
                      : "Show"}
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