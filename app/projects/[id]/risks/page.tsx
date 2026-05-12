import { getAllAssumptionsAndRisks } from "@/lib/actions"
import { RisksWorkspace } from "@/components/risks-workspace"

export default async function RisksPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const items = await getAllAssumptionsAndRisks(id)

  return <RisksWorkspace projectId={id} initialItems={items} />
}
