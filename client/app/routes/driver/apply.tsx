import { useState } from "react";
import { toApiUrl } from "~/utils/api-url";

export function DriverApplicationForm({ driverId }: { driverId: string }) {
  const [sponsorId, setSponsorId] = useState("");
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const res = await fetch(toApiUrl("/api/users/submit-application"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driverId: driverId,
        sponsorCompanyId: sponsorId,
        explanation: explanation
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setMessage("Success! Your application is now pending.");
      setExplanation("");
    } else {
      setMessage(data.error || "Submission failed.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Apply to a Sponsor</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sponsor Selection */}
        <div>
          <label className="block text-sm font-bold text-slate-700 uppercase mb-2">Target Sponsor Company ID</label>
          <input 
            type="number"
            required
            value={sponsorId}
            onChange={(e) => setSponsorId(e.target.value)}
            placeholder="Enter Company ID"
            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none"
          />
        </div>

        {/* Decision Explanation / Statement */}
        <div>
          <label className="block text-sm font-bold text-slate-700 uppercase mb-2">Why should we accept you?</label>
          <textarea
            required
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl h-40 focus:border-blue-500 outline-none"
            placeholder="Provide a brief explanation for your application..."
          />
        </div>

        <button 
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
        >
          {loading ? "Sending..." : "Submit Application"}
        </button>

        {message && (
          <p className={`text-center font-bold mt-4 ${message.includes("Success") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}