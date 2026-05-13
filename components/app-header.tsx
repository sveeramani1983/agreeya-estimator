"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { NewProjectModal } from "@/components/new-project-modal"
import { SignInButton, Show, UserButton } from "@clerk/nextjs"
import { useSaveStatus } from "@/components/save-status-context"
import { ThemeToggle } from "@/components/theme-toggle"

export function AppHeader() {
  const { saving, saved } = useSaveStatus()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-[var(--sidebar)] border-[var(--sidebar-border)] px-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Skynet 1.0
          </span>
          <span className="text-xs font-semibold bg-amber-500 text-white rounded-full px-2 py-0.5">
            β Beta
          </span>
        </h1>
      </div>
      <div className="flex items-center gap-4">
        {saving && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        )}
        {!saving && saved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Saved
          </span>
        )}
        <ThemeToggle />
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="outline" size="sm">Sign In</Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <NewProjectModal />
          <UserButton afterSignOutUrl="/" />
        </Show>
      </div>
    </header>
  )
}
