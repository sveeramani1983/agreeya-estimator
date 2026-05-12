"use client"

import { createContext, useContext, useState, useRef, useCallback } from "react"

interface SaveStatusCtx {
  saving: boolean
  saved: boolean
  setSaveState: (isSaving: boolean) => void
}

const SaveStatusContext = createContext<SaveStatusCtx>({
  saving: false,
  saved: false,
  setSaveState: () => {},
})

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [saving, setSavingState] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setSaveState = useCallback((isSaving: boolean) => {
    setSavingState(isSaving)
    if (!isSaving) {
      setSaved(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 3000)
    }
  }, [])

  return (
    <SaveStatusContext.Provider value={{ saving, saved, setSaveState }}>
      {children}
    </SaveStatusContext.Provider>
  )
}

export function useSaveStatus() {
  return useContext(SaveStatusContext)
}
