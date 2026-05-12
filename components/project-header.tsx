"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, X, Pencil } from "lucide-react"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

import { updateProject } from "@/lib/actions"

// ── EditableField ──────────────────────────────────────────────────────────────

interface EditableFieldProps {
  value: string
  onSave: (value: string) => Promise<void>
  emptyError: string
  maxLength?: number
  displayClassName: string
  inputClassName: string
  saveIconSize?: "sm" | "base"
}

function EditableField({
  value,
  onSave,
  emptyError,
  maxLength = 100,
  displayClassName,
  inputClassName,
  saveIconSize = "base",
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync displayed value when prop changes after router.refresh()
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Auto-focus and select-all when edit mode opens
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error(emptyError)
      setDraft(value)
      setEditing(false)
      return
    }
    if (trimmed === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    setEditing(false)
    try {
      await onSave(trimmed)
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save() }
    if (e.key === "Escape") cancel()
  }

  // onBlur auto-saves — buttons use onMouseDown preventDefault so they
  // don't steal focus and trigger this accidentally
  const handleBlur = () => save()

  const showCharCount = draft.length > maxLength * 0.8
  const iconCls = saveIconSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={saving}
            className={inputClassName}
          />
          {showCharCount && (
            <span className="absolute -bottom-5 right-0 text-[11px] text-muted-foreground tabular-nums">
              {draft.length}/{maxLength}
            </span>
          )}
        </div>
        {/* onMouseDown preventDefault prevents input blur before onClick fires */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded p-0.5 text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
        >
          <Check className={iconCls} />
        </button>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={cancel}
          disabled={saving}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-[#1E2D45] hover:text-foreground transition-colors"
        >
          <X className={iconCls} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className={`group flex items-center gap-1.5 text-left min-w-0 ${displayClassName}`}
    >
      <span className="truncate">{value}</span>
      <Pencil className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity text-slate-400 h-3.5 w-3.5" />
    </button>
  )
}

// ── ProjectHeader ──────────────────────────────────────────────────────────────

interface ProjectHeaderProps {
  projectId: string
  initialName: string
  initialClientName: string
  status: string
  updatedAt?: string
}

export function ProjectHeader({ projectId, initialName, initialClientName, status, updatedAt }: ProjectHeaderProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)

  const handleSaveName = async (newName: string) => {
    setName(newName)
    if (typeof document !== "undefined") document.title = newName
    await updateProject(projectId, { name: newName })
    toast.success("Project renamed")
    router.refresh()
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full overflow-hidden">
      <EditableField
        value={name}
        onSave={handleSaveName}
        emptyError="Project name cannot be empty"
        maxLength={100}
        displayClassName="text-3xl sm:text-4xl font-black tracking-tight text-foreground truncate"
        inputClassName="w-full min-w-[8rem] bg-transparent text-3xl sm:text-4xl font-black tracking-tight text-foreground border-0 border-b-2 border-[#1E2D45] focus:border-primary outline-none leading-tight"
      />
      
      {updatedAt && (
        <span className="flex items-center gap-1.5 text-sm text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
          Updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: false })} ago
        </span>
      )}
    </div>
  )
}
