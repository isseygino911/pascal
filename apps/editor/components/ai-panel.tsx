'use client'

import { buildHouseScene, isHouseSpec, parseHouseSpec } from '../lib/house-builder'
import { generateHouseSpec } from '../lib/gemini'
import { Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

type State =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'error'; message: string }
  | { status: 'done' }

const EXAMPLES = [
  'A modern 2-story family home with 4 bedrooms, 2 bathrooms, open-plan living room and kitchen, and a 2-car garage.',
  'A cosy single-storey studio apartment with a combined living and sleeping area, a kitchen nook, and a bathroom.',
  'A luxury 2-floor villa with a master suite, 3 guest bedrooms, 2 bathrooms, a gym, and a large open living area.',
]

export function AiPanel() {
  const [prompt, setPrompt] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const [lastSpec, setLastSpec] = useState<string | null>(null)

  const isLoading = state.status === 'loading'

  async function handleGenerate() {
    if (!prompt.trim() || isLoading) return
    setState({ status: 'loading', message: 'Sending to Gemini...' })
    try {
      const spec = await generateHouseSpec(prompt, (msg) =>
        setState({ status: 'loading', message: msg }),
      )

      if (!isHouseSpec(spec)) {
        throw new Error('Gemini response did not contain a valid [house] spec. Try rephrasing.')
      }

      setState({ status: 'loading', message: 'Building scene...' })
      setLastSpec(spec)
      const parsed = parseHouseSpec(spec)
      buildHouseScene(parsed)
      setState({ status: 'done' })
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Generate with Kimi</span>
      </div>

      {/* Prompt */}
      <textarea
        className="min-h-[120px] w-full resize-none rounded-lg border border-border/60 bg-accent/30 p-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none disabled:opacity-50"
        disabled={isLoading}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the house you want to generate…&#10;&#10;e.g. A 2-story house with 4 bedrooms, 2 bathrooms, open living room and a 2-car garage."
        value={prompt}
      />

      {/* Examples */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Examples</span>
        {EXAMPLES.map((ex) => (
          <button
            className="rounded px-2 py-1.5 text-left text-muted-foreground text-xs transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
            disabled={isLoading}
            key={ex}
            onClick={() => setPrompt(ex)}
            type="button"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isLoading || !prompt.trim()}
        onClick={handleGenerate}
        type="button"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {isLoading ? 'Generating…' : 'Generate house'}
      </button>

      <p className="text-[10px] text-muted-foreground/60 text-center">
        ⌘ Enter to generate
      </p>

      {/* Status */}
      {state.status === 'loading' && (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-accent/20 px-3 py-2 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          {state.message}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {state.message}
        </div>
      )}

      {state.status === 'done' && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-primary text-xs">
          House generated successfully. Check the Scene panel to explore it.
        </div>
      )}

      {/* Raw spec toggle (dev aid) */}
      {lastSpec && state.status === 'done' && (
        <details className="rounded-lg border border-border/30 text-xs">
          <summary className="cursor-pointer select-none px-3 py-2 text-muted-foreground hover:text-foreground">
            Show raw spec
          </summary>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 pb-3 text-[10px] text-muted-foreground">
            {lastSpec}
          </pre>
        </details>
      )}
    </div>
  )
}
