import { useLoaderData } from "react-router";
import type { Route } from "./+types/about";

// fetch data before rendering anything
export async function loader({ params }: Route.LoaderArgs) {
  const response = await fetch("/api/about");
  
  if (!response.ok) {
    throw new Response('Failed to load "About" information', { status: 500 });
  }
  
  const aboutInfo = await response.json();
  
  return { aboutInfo };
}

export default function About() {
  const { aboutInfo } = useLoaderData<typeof loader>();
  // format release date
  const releaseDate = new Date(aboutInfo.ReleaseDate);
  aboutInfo.ReleaseDate = releaseDate.toLocaleDateString();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          About
        </h1>

        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          <b>Team:</b> {aboutInfo.Team}
          <br />
          <b>Product Name:</b> {aboutInfo.ProductName}
          <br />
          <b>Description:</b> {aboutInfo.ProductDescription}
          <br />
          <b>Version:</b> {aboutInfo.Version}
          <br />
          <b>Release Date:</b> {aboutInfo.ReleaseDate}
        </p>
      </div>
    </div>
  );
}