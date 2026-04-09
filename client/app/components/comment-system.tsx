import { useState, useEffect } from "react";
import { toApiUrl } from "~/utils/api-url";

export function CommentSystem({ reviewId, currentUserId }: { reviewId: string, currentUserId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const fetchComments = async () => {
    const res = await fetch(toApiUrl(`/api/user/review/${reviewId}/comments`));
    const data = await res.json();
    setComments(data);
  };

  useEffect(() => { fetchComments(); }, [reviewId]);

  const handlePost = async (parentId: number | null = null) => {
    const text = parentId ? (document.getElementById(`reply-${parentId}`) as HTMLInputElement).value : newComment;
    
    if (!text) return;

    await fetch(toApiUrl("/api/user/comments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId,
        userId: currentUserId,
        parentCommentId: parentId,
        text
      }),
    });

    setNewComment("");
    setReplyTo(null);
    fetchComments();
  };

  return (
    <div className="bg-slate-50 p-6 rounded-2xl mt-6">
      <h3 className="text-slate-900 font-bold text-xl mb-4">Discussion</h3>
      
      {/* Top Level Post Input */}
      <div className="flex gap-2 mb-8">
        <input 
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 border p-3 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => handlePost(null)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Post</button>
      </div>

      {/* Comments */}
      <div className="space-y-4">
        {comments.filter(c => !c.ParentCommentID).map(parent => (
          <div key={parent.CommentID} className="border-l-4 border-slate-200 pl-4">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-blue-600 uppercase">{parent.FirstName} {parent.LastName}</p>
              <p className="text-slate-800 my-1">{parent.CommentText}</p>
              <button 
                onClick={() => setReplyTo(parent.CommentID)}
                className="text-xs text-slate-400 font-bold hover:text-blue-600"
              >
                REPLY
              </button>
            </div>

            {/* Replies */}
            <div className="ml-8 mt-2 space-y-2">
              {comments.filter(c => c.ParentCommentID === parent.CommentID).map(reply => (
                <div key={reply.CommentID} className="bg-slate-100 p-3 rounded-xl text-sm">
                  <p className="text-xs font-bold text-slate-600">{reply.FirstName} {reply.LastName}</p>
                  <p className="text-slate-700">{reply.CommentText}</p>
                </div>
              ))}

              {/* Reply Input Box */}
              {replyTo === parent.CommentID && (
                <div className="flex gap-2 mt-2">
                  <input id={`reply-${parent.CommentID}`} placeholder="Write a reply..." className="flex-1 p-2 border rounded-lg text-sm outline-none" />
                  <button onClick={() => handlePost(parent.CommentID)} className="bg-slate-800 text-white px-3 py-1 rounded-lg text-xs">Send</button>
                  <button onClick={() => setReplyTo(null)} className="text-xs">Cancel</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}