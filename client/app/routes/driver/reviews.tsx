import { useEffect, useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Card, Button, Alert } from "~/components";
import { CommentSystem } from "~/components/comment-system";
import { createApiClient } from "~/utils/api";
import { requireAuth } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = requireAuth(request, ["driver"]);
  return { user };
}

type DriverReview = {
  reviewId: number;
  itemId: number;
  userId: number;
  rating: number;
  body: string;
  itemName?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  timestamp?: string;
};

function readSponsorCompanyIdFromCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)driverSponsorCompanyId=([^;]+)/);
  if (!match) return null;
  const parsed = Number(decodeURIComponent(match[1]));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function persistSponsorCompanyId(nextSponsorCompanyId: number) {
  if (typeof document === "undefined") return;
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  const secureSuffix = typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `driverSponsorCompanyId=${encodeURIComponent(String(nextSponsorCompanyId))}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureSuffix}`;
}

export default function DriverReviewsPage() {
  const { user } = useLoaderData<typeof loader>();
  const api = useMemo(() => createApiClient({ id: user.UserID, role: "driver" }), [user.UserID]);

  const [sponsorCompanyId, setSponsorCompanyId] = useState<number | null>(null);
  const [reviews, setReviews] = useState<DriverReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureSponsorCompanyId = async () => {
    const fromCookie = readSponsorCompanyIdFromCookie();
    if (fromCookie) {
      setSponsorCompanyId(fromCookie);
      return;
    }

    try {
      const response = await api.getApi(`/drivers/sponsors/${user.UserID}`);
      if (!response.ok) {
        setError("Select a sponsor company before viewing review discussions.");
        return;
      }

      const payload = await response.json().catch(() => []);
      const sponsors = Array.isArray(payload) ? payload : [];
      const firstSponsorCompanyId = Number(sponsors[0]?.SponsorCompanyID);

      if (Number.isInteger(firstSponsorCompanyId) && firstSponsorCompanyId > 0) {
        persistSponsorCompanyId(firstSponsorCompanyId);
        setSponsorCompanyId(firstSponsorCompanyId);
        return;
      }

      setError("No active sponsor companies found.");
    } catch (resolveError) {
      console.error("Failed to resolve sponsor company:", resolveError);
      setError("Select a sponsor company before viewing review discussions.");
    }
  };

  const fetchReviews = async (companyId: number) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(`/reviews?sponsorCompanyId=${companyId}&limit=100`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load reviews.");
      }

      const nextReviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      setReviews(nextReviews);

      if (nextReviews.length > 0) {
        const preferredReviewId = Number(selectedReviewId);
        const hasPreferred = nextReviews.some((review: DriverReview) => Number(review.reviewId) === preferredReviewId);
        setSelectedReviewId(hasPreferred ? preferredReviewId : Number(nextReviews[0].reviewId));
      } else {
        setSelectedReviewId(null);
      }
    } catch (fetchError: any) {
      setError(fetchError.message || "Failed to load reviews.");
      setReviews([]);
      setSelectedReviewId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void ensureSponsorCompanyId();
  }, []);

  useEffect(() => {
    if (!sponsorCompanyId) {
      return;
    }

    void fetchReviews(sponsorCompanyId);
  }, [sponsorCompanyId]);

  const selectedReview = reviews.find((review) => Number(review.reviewId) === Number(selectedReviewId)) ?? null;

  return (
    <div className="min-h-screen bg-linear-to-b from-cyan-50 to-blue-100/50 p-8 dark:from-gray-950 dark:to-blue-950/40">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Review Discussions</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Browse sponsor-scoped review threads and join the conversation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/driver/orders">
              <Button variant="ghost" size="sm">Back to Orders</Button>
            </Link>
            {sponsorCompanyId ? (
              <Button variant="secondary" size="sm" onClick={() => void fetchReviews(sponsorCompanyId)}>
                Refresh
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <Alert message={error} onDismiss={() => setError(null)} /> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <Card className="p-4">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Visible Reviews</h2>
            {loading ? <p className="text-sm text-gray-500">Loading reviews...</p> : null}
            {!loading && reviews.length === 0 ? (
              <p className="text-sm text-gray-500">No reviews found for this sponsor company.</p>
            ) : null}

            <div className="space-y-2">
              {reviews.map((review) => (
                <button
                  key={review.reviewId}
                  type="button"
                  onClick={() => setSelectedReviewId(Number(review.reviewId))}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    Number(selectedReviewId) === Number(review.reviewId)
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
                    {review.itemName || `Item #${review.itemId}`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-800 dark:text-gray-200">{review.body}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Rating: {review.rating}/5 - {review.firstName || "Driver"} {review.lastName || ""}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            {!selectedReview || !sponsorCompanyId ? (
              <p className="text-sm text-gray-500">Select a review to view comments.</p>
            ) : (
              <>
                <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
                    {selectedReview.itemName || `Item #${selectedReview.itemId}`}
                  </p>
                  <p className="mt-2 text-sm text-gray-900 dark:text-gray-100">{selectedReview.body}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Rating: {selectedReview.rating}/5
                  </p>
                </div>

                <CommentSystem
                  reviewId={Number(selectedReview.reviewId)}
                  userId={user.UserID}
                  sponsorCompanyId={sponsorCompanyId}
                />
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
