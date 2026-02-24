import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { Button, Card } from "~/components";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "FleetScore" },
    { name: "description", content: "FleetScore Homepage" },
  ];
}

//export default function Home() {
//  return <Welcome />;
//}

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container-padding section-spacing">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Title Hero */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Welcome to FleetScore!
            </h1>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              <p>{"<subtitle/description>"}</p>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}