import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DocumentsPage } from "./DocumentsPage";

export default async function Documents() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <DocumentsPage />;
}
