import { useMemo, useState } from "react";
import { Button } from "./Button";
import { createApiClient } from "~/utils/api";

interface CreateReviewProps {
    itemId: number;
    itemName: string;
    userId: number;
    sponsorCompanyId: number;
    onCancel: () => void;
    onSuccess?: (reviewId: number) => void;
}

export function CreateReview({
    itemId,
    itemName,
    userId,
    sponsorCompanyId,
    onCancel,
    onSuccess,
}: CreateReviewProps) {
    const api = useMemo(() => createApiClient({ id: userId, role: "driver" }), [userId]);
    const [rating, setRating] = useState(0);
    const [body, setBody] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (rating < 1 || rating > 5) {
            setError("Please choose a star rating from 1 to 5.");
            return;
        }

        const trimmedBody = body.trim();
        if (!trimmedBody) {
            setError("Review text is required.");
            return;
        }

        try {
            setSubmitting(true);
            const response = await api.post(`/reviews?sponsorCompanyId=${sponsorCompanyId}`, {
                itemId,
                rating,
                body: trimmedBody,
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || "Could not post review. Please try again.");
            }

            const reviewId = Number(payload.reviewId);
            if (Number.isInteger(reviewId)) {
                onSuccess?.(reviewId);
            } else {
                onSuccess?.(0);
            }
        } catch (submitError: any) {
            setError(submitError.message || "Could not post review. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
                <h2 className="text-xl font-semibold text-slate-900">Write a Review</h2>
                <p className="text-sm text-slate-500">Item: {itemName}</p>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Rating</label>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                className="text-3xl leading-none"
                                onClick={() => setRating(star)}
                                aria-label={`Set rating to ${star}`}
                            >
                                <span className={rating >= star ? "text-amber-500" : "text-slate-300"}>★</span>
                            </button>
                        ))}
                        <span className="ml-2 text-sm text-slate-500">{rating}/5</span>
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Review</label>
                    <textarea
                        required
                        maxLength={1000}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        className="h-36 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
                        placeholder="Share your experience with this item."
                    />
                    <p className="mt-1 text-right text-xs text-slate-500">{body.length}/1000</p>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={submitting}>
                        {submitting ? "Posting..." : "Post Review"}
                    </Button>
                </div>
            </form>
        </div>
    );
}