"use client"

import { useState } from "react"
import { Search, Plus, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

interface LibraryComponent {
  id: string
  category: string
  component_name: string
  description: string
  complexity: string
  story_points: number
  base_hours: number
}

interface AddFromLibraryModalProps {
  library: LibraryComponent[]
  onAdd: (selected: LibraryComponent[]) => void
}

export function AddFromLibraryModal({ library, onAdd }: AddFromLibraryModalProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = library.filter(c => 
    c.component_name.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const handleAdd = () => {
    const selected = library.filter(c => selectedIds.has(c.id))
    onAdd(selected)
    setOpen(false)
    setSelectedIds(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add from Library
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Component Library</DialogTitle>
          <DialogDescription>
            Search and select multiple components to add to your WBS.
          </DialogDescription>
        </DialogHeader>

        <div className="sticky top-0 z-10 bg-[#111827] pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[450px] border rounded-md">
          <div className="p-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground italic">
                No components match your search.
              </div>
            ) : filtered.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => toggleSelect(item.id)}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleSelect(item.id)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{item.component_name}</span>
                    <Badge variant="secondary" className="shrink-0">{item.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                  <div className="flex gap-4 text-xs font-medium text-muted-foreground">
                    <span>Complexity: <span className="text-foreground capitalize">{item.complexity.replace('_', ' ')}</span></span>
                    <span>SP: <span className="text-foreground">{item.story_points}</span></span>
                    <span>Hrs: <span className="text-foreground">{item.base_hours}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0}
            className="bg-sidebar text-white hover:bg-sidebar-accent"
          >
            Add {selectedIds.size > 0 ? `${selectedIds.size} ` : ""}Components
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
