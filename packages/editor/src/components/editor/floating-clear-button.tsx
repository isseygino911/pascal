'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../ui/primitives/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/primitives/dialog'
import useEditor, { selectDefaultBuildingAndLevel } from '../../store/use-editor'

export function FloatingClearButton() {
  const [open, setOpen] = useState(false)
  const clearScene = useScene((s) => s.clearScene)
  const resetSelection = useViewer((s) => s.resetSelection)
  const setPhase = useEditor((s) => s.setPhase)

  const handleConfirm = () => {
    clearScene()
    resetSelection()
    setPhase('structure')
    selectDefaultBuildingAndLevel()
    setOpen(false)
  }

  return (
    <>
      <div className="absolute inset-0 pointer-events-none">
        <button
          aria-label="Clear project"
          className="pointer-events-auto absolute bottom-4 right-4 flex size-8 items-center justify-center rounded-lg bg-background/80 text-muted-foreground opacity-50 shadow-sm backdrop-blur-sm transition-opacity hover:opacity-100 hover:text-destructive"
          onClick={() => setOpen(true)}
          title="Clear project"
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear project?</DialogTitle>
            <DialogDescription>
              This will remove all your work and reset to a blank scene. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirm}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
