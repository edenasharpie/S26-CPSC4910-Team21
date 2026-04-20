import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "~/utils/api";

type ReviewComment = {
  commentId: number;
  reviewId: number;
  sponsorCompanyId: number;
  userId: number;
  firstName?: string | null;
  lastName?: string | null;
  parentCommentId: number | null;
  text: string;
  createdAt?: string | null;
};

interface CommentSystemProps {
  reviewId: number;
  userId: number;
  sponsorCompanyId: number;
}

export function CommentSystem({ reviewId, userId, sponsorCompanyId }: CommentSystemProps) {
  const api = useMemo(() => createApiClient({ id: userId, role: "driver" }), [userId]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentPath = `/reviews/${reviewId}/comments?sponsorCompanyId=${sponsorCompanyId}`;

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(commentPath);
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || "Failed to load comments.");
      }

      const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
      setComments(nextComments);
    } catch (fetchError: any) {
      setError(fetchError.message || "Failed to load comments.");
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchComments();
  }, [reviewId, sponsorCompanyId]);

  const handlePost = async (parentId: number | null = null) => {
    const text = parentId ? String(replyDrafts[parentId] ?? "").trim() : newComment.trim();
    if (!text) return;

    try {
      setSubmitting(true);
      setError(null);

      const response = await api.post(commentPath, {
        text,
        parentCommentId: parentId,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Failed to post comment.");
      }

      setNewComment("");
      setReplyTo(null);
      if (parentId) {
        setReplyDrafts((previous) => ({
          ...previous,
          [parentId]: "",
        }));
      }

      await fetchComments();
    } catch (postError: any) {
      setError(postError.message || "Failed to post comment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Discussion</h3>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      
      {/* Top Level Post Input */}
      <div className="flex gap-2 mb-8">
        <input 
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 rounded-xl border border-gray-300 bg-white p-3 text-gray-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <button
          onClick={() => void handlePost(null)}
          disabled={submitting}
          className="rounded-xl bg-primary-600 px-6 py-2 font-bold text-white transition-colors hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-900/50"
        >
          Post
        </button>
      </div>

      {/* Comments */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading comments...</p>
        ) : null}

        {!loading && comments.filter((c) => !c.parentCommentId).length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
        ) : null}

        {comments.filter((c) => !c.parentCommentId).map((parent) => (
          <div key={parent.commentId} className="border-l-4 border-gray-200 pl-4 dark:border-gray-700">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-bold uppercase text-primary-600 dark:text-primary-400">
                {parent.firstName || "Driver"} {parent.lastName || ""}
              </p>
              <p className="my-1 text-gray-800 dark:text-gray-200">{parent.text}</p>
              <button 
                onClick={() => setReplyTo(parent.commentId)}
                className="text-xs font-bold text-gray-500 transition-colors hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
              >
                REPLY
              </button>
            </div>

            {/* Replies */}
            <div className="ml-8 mt-2 space-y-2">
              {comments.filter((c) => c.parentCommentId === parent.commentId).map((reply) => (
                <div key={reply.commentId} className="rounded-xl border border-gray-200 bg-gray-100 p-3 text-sm dark:border-gray-700 dark:bg-gray-700/60">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    {reply.firstName || "Driver"} {reply.lastName || ""}
                  </p>
                  <p className="text-gray-700 dark:text-gray-200">{reply.text}</p>
                </div>
              ))}

              {/* Reply Input Box */}
              {replyTo === parent.commentId && (
                <div className="flex gap-2 mt-2">
                  <input
                    value={replyDrafts[parent.commentId] ?? ""}
                    onChange={(event) =>
                      setReplyDrafts((previous) => ({
                        ...previous,
                        [parent.commentId]: event.target.value,
                      }))
                    }
                    placeholder="Write a reply..."
                    className="flex-1 rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <button
                    onClick={() => void handlePost(parent.commentId)}
                    disabled={submitting}
                    className="rounded-lg bg-primary-600 px-3 py-1 text-xs text-white transition-colors hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-900/50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="text-xs text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}