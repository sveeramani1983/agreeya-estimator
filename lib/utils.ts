import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { WBSComponent } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Returns all WBS components that are duplicates of an earlier row
// (same component_name + category, case-insensitive).
export function findDuplicateComponents(components: WBSComponent[]): WBSComponent[] {
  const seen = new Map<string, string>()
  const duplicates: WBSComponent[] = []
  for (const comp of components) {
    const key =
      comp.component_name.trim().toLowerCase() + "||" + comp.category.trim().toLowerCase()
    if (seen.has(key)) {
      duplicates.push(comp)
    } else {
      seen.set(key, comp.id)
    }
  }
  return duplicates
}
