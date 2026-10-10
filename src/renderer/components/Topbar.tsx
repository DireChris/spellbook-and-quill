import { Search, Command, CircleHelp, Bell, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SearchResult } from '../../shared/types'
import { SearchResultList } from './SearchResultList'

interface TopbarProps {
  query: string; onQueryChange: (value: string) => void; results: SearchResult[]; searching: boolean;
  onOpenResult: (result: SearchResult) => void; onResultTags: (result: SearchResult, tags: string[]) => void;
}
export function Topbar({ query, onQueryChange, results, searching, onOpenResult, onResultTags }: TopbarProps) {
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); wrap.current?.querySelector('input')?.focus() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); document.querySelector<HTMLInputElement>('[data-tag-input="note"]')?.focus() }
      if (event.key === 'Escape') { onQueryChange(''); (document.activeElement as HTMLElement | null)?.blur?.() }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [onQueryChange])
  return (
    <header className="topbar relative z-30 flex h-[76px] shrink-0 items-center gap-5 border-b border-white/[.06] px-6">
      <div className="relative max-w-[630px] flex-1" ref={wrap}>
        <div className="search-wrap flex h-10 items-center gap-3 rounded-xl border border-white/[.08] bg-[#0d0f14]/85 px-3.5 transition focus-within:border-brass-400/40 focus-within:shadow-soft-glow">
          <Search size={15} className="shrink-0 text-white/35" /><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search notes, quests, clues, people…" className="min-w-0 flex-1 bg-transparent text-xs text-parchment outline-none placeholder:text-white/30" aria-label="Search all campaign content" />
          {query ? <button onClick={() => onQueryChange('')} className="text-white/35 hover:text-white/80"><X size={14} /></button> : <div className="hidden items-center gap-1 rounded-md border border-white/[.08] bg-white/[.025] px-1.5 py-1 text-[9px] text-white/30 sm:flex"><Command size={10} /> K</div>}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden items-center gap-2 text-[10px] text-white/35 lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />Everything saved on this device</div>
        <div className="h-5 w-px bg-white/[.08]" />
        <button title="Keyboard shortcuts" onClick={() => window.alert('Shortcuts\nCtrl / Cmd + K — Focus global search\nCtrl / Cmd + T — Focus note tags\nEscape — Clear search')} className="icon-button"><CircleHelp size={15} /></button>
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-brass-400/25 bg-gradient-to-br from-[#51432b] to-[#26251f] font-display text-sm text-brass-300"><Bell size={14} /><span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-ink-950 bg-brass-400" /></div>
      </div>
      {query.trim() && <div className="search-dropdown absolute left-6 right-6 top-[62px] z-50 mx-auto max-w-[630px] overflow-hidden rounded-xl border border-white/[.1] bg-[#13161e] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">Campaign search</span><span className="text-[10px] text-white/30">{searching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</span></div>
        <div className="max-h-[min(62vh,560px)] overflow-y-auto p-2"><SearchResultList results={results} onOpen={onOpenResult} onTagsChange={onResultTags} compact /></div>
        <div className="border-t border-white/[.06] px-4 py-2 text-[9px] text-white/25">Tags can be edited right here. Enter a search term to look across your whole campaign.</div>
      </div>}
    </header>
  )
}
