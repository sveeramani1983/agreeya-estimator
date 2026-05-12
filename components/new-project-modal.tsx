"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createProject } from "@/lib/actions"
import { ProjectStatus } from "@/lib/types"

export function NewProjectModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    
    const formData = new FormData(event.currentTarget)
    const name = formData.get("name") as string
    const client_name = formData.get("client_name") as string
    
    if (!name.trim() || !client_name.trim()) {
      toast.error("Project Name and Client Name are required.")
      return
    }

    setLoading(true)
    const data = {
      name: name.trim(),
      client_name: client_name.trim(),
      description: formData.get("description") as string,
      status: (formData.get("status") as ProjectStatus) || "draft",
    }

    try {
      const { id } = await createProject(data)
      toast.success("Project created successfully")
      setOpen(false)
      router.push(`/projects/${id}/estimate`)
    } catch (error) {
      toast.error("Failed to create project")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-sidebar hover:bg-sidebar-accent text-white gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Enter the project details to start a new estimation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name <span className="text-red-500">*</span></Label>
              <Input id="name" name="name" placeholder="e.g. E-commerce Platform" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client_name">Client Name <span className="text-red-500">*</span></Label>
              <Input id="client_name" name="client_name" placeholder="e.g. Acme Corp" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Initial Status</Label>
              <Select name="status" defaultValue="draft">
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Briefly describe the project scope..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-sidebar text-white hover:bg-sidebar-accent">
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
