import { useFetcher } from "react-router";
import { Button, Card, Badge } from "~/components";

export default function SponsorCard({ sponsor }: any) {
  const fetcher = useFetcher();
  const isPending = fetcher.state !== "idle";

  const handleReactivate = () => {
    fetcher.submit(
      {}, 
      { method: "put", action: `/api/admin/reactivate-sponsor/${sponsor.UserID}` }
    );
  };

  return (
    <Card className="p-4 mb-4 flex items-center justify-between bg-white dark:bg-gray-900 border">
      <div className="flex flex-col">
        <span className="text-lg font-bold">{sponsor.FirstName} {sponsor.LastName}</span>
        <span className="text-sm text-gray-500">{sponsor.Email}</span>
        <div className="mt-2">
          <Badge variant={sponsor.IsActive ? "success" : "danger"}>
            {sponsor.IsActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {!sponsor.IsActive && (
        <Button 
          onClick={handleReactivate}
          disabled={isPending}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isPending ? "Processing..." : "Restore Access"}
        </Button>
      )}
    </Card>
  );
}