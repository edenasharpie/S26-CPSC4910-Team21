import { useState, useEffect } from "react";

export function CreateReview({ itemId, userId }: { itemId: string, userId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");

    useEffect(() => {
    const loadDraft = async () => {
        const res = await fetch(`http://localhost:5001/api/users/drafts/${userId}/${itemId}`);
        const draft = await res.json();
        if (draft) {
        setBody(draft.ReviewBody);
        setRating(draft.Rating);
        }
    };
    loadDraft();
    }, [itemId, userId]);

    const saveDraft = async () => {
    await fetch("http://localhost:5001/api/users/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, userId, rating, body }),
    });
    alert("Draft saved!");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) return alert("Please select a star rating!");

        const res = await fetch("http://localhost:5001/api/users/post-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, userId, rating, body }),
        });

        if (res.ok) {
        setStatus("Review posted!");
        setBody("");
        setRating(0);
        }
    };

    return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Write a Review</h2>
        {/* Visual indicator that a draft is being tracked */}
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Drafting Mode
        </span>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
        {/* Star Rating Selection */}
        <div>
            <label className="block text-sm font-bold text-slate-700 uppercase mb-2">Rating</label>
            <div className="flex gap-2 items-center">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                key={star}
                type="button"
                className="text-3xl transition-transform hover:scale-110"
                onClick={() => setRating(star)}
                >
                <span className={rating >= star ? "text-yellow-400" : "text-slate-200"}>
                    ★
                </span>
                </button>
            ))}
            <span className="ml-4 text-slate-500 font-medium">{rating} / 5 Stars</span>
            </div>
        </div>

        {/* Review Text Body */}
        <div>
            <label className="block text-sm font-bold text-slate-700 uppercase mb-2">Your Thoughts</label>
            <textarea
            required
            className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none h-40 transition-all resize-none"
            placeholder="What did you think of this product? Don't worry, we've got your draft saved."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
            {/* The Save Draft Button (Type="button" so it doesn't submit the form) */}
            <button
            type="button"
            onClick={saveDraft}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all active:scale-95 border-2 border-slate-200"
            >
            Save for Later
            </button>

            {/* The Final Submit Button */}
            <button 
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
            >
            Post Review
            </button>
        </div>
        
        <p className="text-center text-xs text-slate-400">
            Submitting will automatically remove this from your saved drafts.
        </p>
        </form>
    </div>
    );
}