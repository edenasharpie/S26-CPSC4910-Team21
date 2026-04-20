import { useEffect, useMemo, useState } from "react";
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
    const [savingDraft, setSavingDraft] = useState(false);
    const [loadingDraft, setLoadingDraft] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [draftMessage, setDraftMessage] = useState<string | null>(null);

    const draftPath = `/reviews/drafts/${itemId}?sponsorCompanyId=${sponsorCompanyId}`;

    useEffect(() => {
        const loadDraft = async () => {
            try {
                setLoadingDraft(true);
                setDraftMessage(null);
                const response = await api.get(draftPath);
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(payload.error || "Could not load draft.");
                }

                if (payload.draft) {
                    const nextRating = Number(payload.draft.rating);
                    const nextBody = String(payload.draft.body ?? "");
                    if (Number.isInteger(nextRating) && nextRating >= 1 && nextRating <= 5) {
                        setRating(nextRating);
                    }
                    setBody(nextBody);
                    setDraftMessage("Loaded your saved draft.");
                }
            } catch (loadError: any) {
                console.error("Failed to load review draft:", loadError);
            } finally {
                setLoadingDraft(false);
            }
        };

        void loadDraft();
    }, [api, draftPath]);

    const handleSaveDraft = async () => {
        const normalized = body.trim();
        setError(null);
        setDraftMessage(null);

        if (!normalized) {
            setError("Add some review text before saving a draft.");
            return;
        }

        if (rating < 1 || rating > 5) {
            setError("Please choose a star rating from 1 to 5 before saving draft.");
            return;
        }

        try {
            setSavingDraft(true);
            const response = await api.fetch(draftPath, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating,
                    body: normalized,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || "Could not save draft.");
            }

            setDraftMessage("Draft saved.");
        } catch (draftError: any) {
            setError(draftError.message || "Could not save draft.");
        } finally {
            setSavingDraft(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setDraftMessage(null);

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
            setBody("");
            setRating(0);
        } catch (submitError: any) {
            setError(submitError.message || "Could not post review. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Write a Review</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Item: {itemName}</p>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                    {error}
                </div>
            )}

            {draftMessage && (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                    {draftMessage}
                </div>
            )}

            {loadingDraft && (
                <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                    Loading draft...
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Rating</label>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                className="text-3xl leading-none"
                                onClick={() => setRating(star)}
                                aria-label={`Set rating to ${star}`}
                            >
                                <span className={rating >= star ? "text-amber-500 dark:text-amber-400" : "text-gray-300 dark:text-gray-600"}>★</span>
                            </button>
                        ))}
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{rating}/5</span>
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Review</label>
                    <textarea
                        required
                        maxLength={1000}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        className="h-36 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Share your experience with this item."
                    />
                    <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{body.length}/1000</p>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                    <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => void handleSaveDraft()} disabled={submitting || savingDraft}>
                        {savingDraft ? "Saving Draft..." : "Save Draft"}
                    </Button>
                    <Button type="submit" variant="primary" disabled={submitting}>
                        {submitting ? "Posting..." : "Post Review"}
                    </Button>
                </div>
            </form>
        </div>
    );
}