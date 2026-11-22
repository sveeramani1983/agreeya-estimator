import { notFound } from "next/navigation"
import Link from "next/link"
import { getClient } from "@/lib/actions"
import { ClientDetailClient } from "@/components/client-detail-client"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params
  const result = await getClient(id)
  if (!result) notFound()

  const { client, contacts, notes, projects } = result

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Clients
        </Link>
      </div>
      <ClientDetailClient
        client={client}
        contacts={contacts}
        notes={notes}
        projects={projects}
      />
    </div>
  )
}
