import { headers } from "next/headers";
import { redirect } from "next/navigation";
import JourneyPage from "./journey/page";

export { metadata } from "./journey/page";

export default async function HomePage() {
  const host = (await headers()).get("host");
  if (host === "qatesting.go2china.space") redirect("/qa");
  return <JourneyPage />;
}
