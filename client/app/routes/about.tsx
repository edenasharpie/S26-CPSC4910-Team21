import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/about";

// fetch data before rendering anything
export async function loader({ params }: Route.LoaderArgs) {
  // absolute URL for server-side fetches, relative for client-side
  const apiUrl = typeof window === 'undefined' 
    ? process.env.API_URL || 'http://localhost:5000'
    : '';
    
  const response = await fetch(`${apiUrl}/api/about`);
  
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
        <Link to="/" className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-6 block">← Home</Link>
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