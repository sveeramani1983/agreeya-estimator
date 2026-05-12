"use client"

import { useState } from "react"
import { Plus, Search, Trash2, Edit, UploadCloud } from "lucide-react"
import Papa from "papaparse"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

import { 
  createLibraryComponent, 
  updateLibraryComponent, 
  deleteLibraryComponent, 
  bulkImportLibraryComponents 
} from "@/lib/actions"

export function LibraryManager({ initialLibrary }: { initialLibrary: any[] }) {
  const [library, setLibrary] = useState(initialLibrary)
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("All")
  
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const filtered = library.filter(c => {
    const matchSearch = c.component_name.toLowerCase().includes(search.toLowerCase()) || 
                        (c.description || "").toLowerCase().includes(search.toLowerCase())
    const matchCategory = filterCategory === "All" || c.category === filterCategory
    return matchSearch && matchCategory
  })

  const handleOpenEdit = (item?: any) => {
    if (item) {
      setEditingItem(item)
    } else {
      setEditingItem({
        category: "User Story",
        component_name: "",
        description: "",
        complexity: "medium",
        story_points: 5,
        base_hours: 20,
        notes: ""
      })
    }
    setIsSheetOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingItem.id) {
        await updateLibraryComponent(editingItem.id, editingItem)
        setLibrary(prev => prev.map(c => c.id === editingItem.id ? editingItem : c))
        toast.success("Component updated")
      } else {
        await createLibraryComponent(editingItem)
        // Refresh by reloading page or appending (mock append for now)
        toast.success("Component created, refresh to see in list")
        window.location.reload()
      }
      setIsSheetOpen(false)
    } catch (error) {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteLibraryComponent(id)
      setLibrary(prev => prev.filter(c => c.id !== id))
      toast.success("Component deleted")
    } catch (error) {
      toast.error("Failed to delete")
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const components = results.data.map((row: any) => ({
            category: row.category || 'Other',
            component_name: row.component_name || 'Unnamed',
            description: row.description || '',
            complexity: row.complexity || 'medium',
            story_points: Number(row.story_points) || 0,
            base_hours: Number(row.base_hours) || 0,
            notes: row.notes || ''
          }))

          await bulkImportLibraryComponents(components)
          toast.success(`Successfully imported ${components.length} components`)
          window.location.reload()
        } catch (error) {
          toast.error("Import failed. Ensure CSV columns match schema.")
        }
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-2 max-w-lg w-full">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search components..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterCategory} onValueChange={v => v && setFilterCategory(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              <SelectItem value="User Story">User Story</SelectItem>
              <SelectItem value="Frontend">Frontend</SelectItem>
              <SelectItem value="Backend">Backend</SelectItem>
              <SelectItem value="Integration">Integration</SelectItem>
              <SelectItem value="Data/Analytics">Data/Analytics</SelectItem>
              <SelectItem value="Infrastructure">Infrastructure</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
              <SelectItem value="Mobile">Mobile</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative">
            <Input 
              type="file" 
              accept=".csv" 
              onChange={handleFileUpload} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Button variant="outline" className="w-full gap-2">
              <UploadCloud className="h-4 w-4" />
              Import CSV
            </Button>
          </div>
          <Button onClick={() => handleOpenEdit()} className="bg-sidebar text-white hover:bg-sidebar-accent gap-2">
            <Plus className="h-4 w-4" /> Add Component
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden">
        <Table>
          <TableHeader className="bg-[#0D1526]">
            <TableRow>
              <TableHead>Component Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Complexity</TableHead>
              <TableHead className="text-right">SP</TableHead>
              <TableHead className="text-right">Base Hrs</TableHead>
              <TableHead className="text-center">Times Used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length > 0 ? (
              filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div>{item.component_name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="capitalize">{item.complexity.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right">{item.story_points}</TableCell>
                  <TableCell className="text-right">{item.base_hours}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{item.times_used || 0}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => handleOpenEdit(item)}>
                      <Edit className="h-4 w-4 text-muted-foreground hover:text-sidebar" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No components found matching your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-xl flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>{editingItem?.id ? "Edit Component" : "New Component"}</SheetTitle>
            <SheetDescription>
              Add reusable estimation blocks to your library.
            </SheetDescription>
          </SheetHeader>

          {editingItem && (
            <div className="mt-6 flex-1 overflow-y-auto space-y-4 pr-4">
              <div className="space-y-2">
                <Label>Component Name</Label>
                <Input 
                  value={editingItem.component_name} 
                  onChange={e => setEditingItem({...editingItem, component_name: e.target.value})} 
                  placeholder="e.g., User Login Auth"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editingItem.category} onValueChange={v => v && setEditingItem({...editingItem, category: v})}>
                  <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["User Story", "Frontend", "Backend", "Integration", "Data/Analytics", "Infrastructure", "Security", "Mobile", "Other"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Complexity</Label>
                <Select value={editingItem.complexity} onValueChange={v => v && setEditingItem({...editingItem, complexity: v})}>
                  <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["simple", "medium", "complex", "very_complex", "spike"].map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Story Points</Label>
                  <Input type="number" value={editingItem.story_points} onChange={e => setEditingItem({...editingItem, story_points: Number(e.target.value)})} />
                </div>
                <div className="space-y-2">
                  <Label>Base Hours</Label>
                  <Input type="number" value={editingItem.base_hours} onChange={e => setEditingItem({...editingItem, base_hours: Number(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea 
                  value={editingItem.description || ""} 
                  onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
                  className="resize-none h-24"
                />
              </div>
            </div>
          )}

          <SheetFooter className="mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-sidebar text-white hover:bg-sidebar-accent">
              {saving ? "Saving..." : "Save Component"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
