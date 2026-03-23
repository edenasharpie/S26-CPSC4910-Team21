import { useFetcher } from "react-router";
import { Button, Card, Badge } from "~/components";

// Note: This is a card component, not a standalone route.

export default function ReactivateDriver({ driverId, name, isCurrentlyActive }: any) {
  const fetcher = useFetcher();

  const handleReactivate = () => {
    if (confirm(`Are you sure you want to reactivate ${name}?`)) {
      fetcher.submit(
        { driverId },
        { method: "put", action: `/api/admin/reactivate-driver/${driverId}` }
      );
    }
  };

  return (
    <Card className="p-6 flex items-center justify-between border-l-4 border-blue-500">
      <div>
        <h3 className="text-lg font-bold">{name}</h3>
        <p className="text-sm text-gray-500">ID: {driverId}</p>
        <Badge variant={isCurrentlyActive ? "success" : "danger"}>
          {isCurrentlyActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {!isCurrentlyActive && (
        <Button 
          onClick={handleReactivate}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6"
        >
          Reactivate Account
        </Button>
      )}
    </Card>
  );
}