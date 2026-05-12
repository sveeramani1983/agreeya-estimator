import { getLibraryComponents } from "@/lib/actions"
import { LibraryManager } from "@/components/library-manager"
import { BookOpen } from "lucide-react"

export default async function LibraryPage() {
  const library = await getLibraryComponents()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-sidebar" />
        <h2 className="text-2xl font-bold tracking-tight">Component Library</h2>
      </div>
      
      <LibraryManager initialLibrary={library} />
    </div>
  )
}
