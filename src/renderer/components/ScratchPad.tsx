import { useEffect, useState } from 'react'
import { Bookmark, Clipboard, Eraser, Feather, Zap } from 'lucide-react'

interface ScratchPadProps { value: string; onSave: (content: string) => Promise<unknown> | void }
export function ScratchPad({ value, onSave }: ScratchPadProps) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(true)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    setSaved(false)
    const timer = window.setTimeout(async () => {
      try { await onSave(draft); setSaved(true) } catch { setSaved(false) }
    }, 420)
    return () => window.clearTimeout(timer)
  }, [draft, value, onSave])
  return (
    <section className="panel-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
        <div className="flex items-center gap-2"><div className="icon-tile icon-tile-amber"><Feather size={14} /></div><div><h3 className="text-xs font-semibold text-parchment">Scratch Pad</h3><p className="mt-0.5 text-[9px] uppercase tracking-[.12em] text-white/35">Ephemeral thoughts, permanent save</p></div></div>
        <button title="Clear scratch pad" onClick={() => { setDraft(''); void onSave(''); setSaved(true) }} className="icon-button"><Eraser size={13} /></button>
      </div>
      <div className="p-3">
        <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Initiative order… a clue to revisit… a name you can’t forget…" className="scratch-textarea" spellCheck />
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/30"><span className="flex items-center gap-1"><Zap size={11} className="text-brass-400" />Auto-saves as you play</span><span className="flex items-center gap-1">{saved ? <Bookmark size={11} /> : <Clipboard size={11} />}{saved ? 'Saved locally' : 'Saving…'}</span></div>
      </div>
    </section>
  )
}
