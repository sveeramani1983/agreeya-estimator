import { getClients } from "@/lib/actions"
import { ClientsClient } from "@/components/clients-client"

export default async function ClientsPage() {
  const clients = await getClients()
  return <ClientsClient initialClients={clients} />
}
