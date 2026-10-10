import { Search, Command, CircleHelp, X, LibraryBig } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SearchResult } from '../../shared/types'
import { SearchResultList } from './SearchResultList'

interface TopbarProps {
  query: string
  onQueryChange: (value: string) => void
  results: SearchResult[]
  searching: boolean
  onOpenResult: (result: SearchResult) => void
  onResultTags: (result: SearchResult, tags: string[]) => void
  allCampaigns: boolean
  onAllCampaignsChange: (value: boolean) => void
}
export function Topbar({ query, onQueryChange, results, searching, onOpenResult, onResultTags, allCampaigns, onAllCampaignsChange }: TopbarProps) {
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
      <div className="relative max-w-[700px] flex-1" ref={wrap}>
        <div className="search-wrap flex h-10 items-center gap-3 rounded-xl border border-white/[.08] bg-[#0d0f14]/85 px-3.5 transition focus-within:border-brass-400/40 focus-within:shadow-soft-glow">
          <Search size={15} className="shrink-0 text-white/35" /><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Search notes, quests, clues, people…" className="min-w-0 flex-1 bg-transparent text-xs text-parchment outline-none placeholder:text-white/30" aria-label="Search campaign content" />
          {query ? <button onClick={() => onQueryChange('')} className="text-white/35 hover:text-white/80" aria-label="Clear search"><X size={14} /></button> : <div className="hidden items-center gap-1 rounded-md border border-white/[.08] bg-white/[.025] px-1.5 py-1 text-[9px] text-white/30 sm:flex"><Command size={10} /> K</div>}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="hidden items-center gap-2 text-[10px] text-white/35 lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-sage" />Saved on this device</div>
        <button title="Keyboard shortcuts" onClick={() => window.alert('Shortcuts\nCtrl / Cmd + K — Focus global search\nCtrl / Cmd + T — Focus note tags\nEscape — Clear search')} className="icon-button"><CircleHelp size={15} /></button>
      </div>
      {query.trim() && <div className="search-dropdown absolute left-6 right-6 top-[62px] z-50 mx-auto max-w-[700px] overflow-hidden rounded-xl border border-white/[.1] bg-[#13161e] shadow-2xl shadow-black/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.06] px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/40">{allCampaigns ? 'All-campaign search' : 'Active campaign search'}</span><div className="flex items-center gap-3"><button type="button" onClick={() => onAllCampaignsChange(!allCampaigns)} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] ${allCampaigns ? 'border-brass-300/30 bg-brass-400/[.08] text-brass-200' : 'border-white/[.08] text-white/35 hover:text-white/65'}`}><LibraryBig size={11}/>{allCampaigns ? 'All campaigns' : 'Active only'}</button><span className="text-[10px] text-white/30">{searching ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</span></div></div>
        <div className="max-h-[min(62vh,560px)] overflow-y-auto p-2"><SearchResultList results={results} onOpen={onOpenResult} onTagsChange={onResultTags} compact /></div>
        <div className="border-t border-white/[.06] px-4 py-2 text-[9px] text-white/25">Tags can be edited here. Toggle all campaigns to include other adventures in this search.</div>
      </div>}
    </header>
  )
}
