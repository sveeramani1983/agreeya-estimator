import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SummaryPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/projects/${id}/review`)
}

