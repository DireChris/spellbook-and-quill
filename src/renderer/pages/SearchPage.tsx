import { useEffect, useMemo, useState } from 'react'
import { Search, Tags, LibraryBig, LoaderCircle, ArrowUpRight } from 'lucide-react'
import type { RelatedTag, SearchResult } from '../../shared/types'
import { SearchResultList } from '../components/SearchResultList'

interface Props {
  query: string
  onQueryChange: (value: string) => void
  results: SearchResult[]
  searching: boolean
  allCampaigns: boolean
  onAllCampaignsChange: (value: boolean) => void
  onOpenResult: (result: SearchResult) => void
  onResultTags: (result: SearchResult, tags: string[]) => void
  onTagClick: (tag: string) => void
  onOpenSearch: () => void
}
const filters = [
  { id: 'note', label: 'Session notes', types: ['note'] },
  { id: 'quest', label: 'Quests', types: ['quest'] },
  { id: 'npc', label: 'NPCs & logs', types: ['npc', 'npc_log'] },
  { id: 'loot', label: 'Vault / loot', types: ['loot'] },
  { id: 'scratch', label: 'Scratchpad', types: ['scratch'] },
]
export function SearchPage({ query, onQueryChange, results, searching, allCampaigns, onAllCampaignsChange, onOpenResult, onResultTags, onTagClick, onOpenSearch }: Props) {
  const [enabled, setEnabled] = useState<string[]>(filters.map(filter => filter.id))
  const [relatedTags, setRelatedTags] = useState<RelatedTag[]>([])
  const tagName = query.match(/^\[([^\]]+)\]$/u)?.[1]?.trim() || ''
  useEffect(() => {
    let alive = true
    if (!tagName) { setRelatedTags([]); return }
    window.spellbook.relatedTags(tagName, allCampaigns).then(tags => { if (alive) setRelatedTags(tags) }).catch(() => { if (alive) setRelatedTags([]) })
    return () => { alive = false }
  }, [tagName, allCampaigns])
  const filteredResults = useMemo(() => results.filter(result => filters.some(filter => enabled.includes(filter.id) && filter.types.includes(result.entityType))), [results, enabled])
  const textResults = filteredResults.filter(result => result.matchKind !== 'tag')
  const tagResults = filteredResults.filter(result => result.matchKind === 'tag')
  const isTagSearch = Boolean(tagName)
  return <div className="page-enter h-full min-h-0 overflow-y-auto p-5 xl:p-7">
    <div className="mx-auto max-w-[1120px]">
      <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-brass-300"><Search size={13}/> The campaign archive</div><h1 className="font-display text-3xl tracking-[-.035em] text-parchment">Search</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">Find a clue, person, place, item or forgotten detail anywhere in your campaign records.</p></div>
      <div className="panel-card mb-5 p-4 md:p-5">
        <div className="flex items-center gap-3 rounded-xl border border-white/[.09] bg-black/20 px-4 py-3 focus-within:border-brass-400/40"><Search size={17} className="shrink-0 text-brass-300/70"/><input autoFocus value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onOpenSearch() }} placeholder="Search text or enter a tag like [magic weapon]…" className="min-w-0 flex-1 bg-transparent text-sm text-parchment outline-none placeholder:text-white/25" aria-label="Search all campaign records"/>{searching && <LoaderCircle size={15} className="animate-spin text-brass-300"/>}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-[9px] font-semibold uppercase tracking-[.14em] text-white/30">Record type</span>{filters.map(filter => { const active = enabled.includes(filter.id); return <button key={filter.id} onClick={() => setEnabled(previous => active ? previous.filter(id => id !== filter.id) : [...previous, filter.id])} className={`rounded-full border px-3 py-1.5 text-[10px] transition ${active ? 'border-brass-300/25 bg-brass-400/[.09] text-brass-200' : 'border-white/[.08] text-white/35 hover:text-white/65'}`}>{filter.label}</button> })}<button onClick={() => setEnabled(enabled.length === filters.length ? [] : filters.map(filter => filter.id))} className="ml-auto text-[9px] text-white/30 hover:text-white/60">{enabled.length === filters.length ? 'Clear filters' : 'Select all'}</button></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] pt-3"><div className="text-[10px] text-white/35">{allCampaigns ? 'Searching every campaign' : 'Searching the active campaign'} · {searching ? 'Searching…' : `${filteredResults.length} matching record${filteredResults.length === 1 ? '' : 's'}`}</div><button type="button" onClick={() => onAllCampaignsChange(!allCampaigns)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] ${allCampaigns ? 'border-brass-300/25 bg-brass-400/[.08] text-brass-200' : 'border-white/[.08] text-white/40 hover:text-white/70'}`}><LibraryBig size={12}/>{allCampaigns ? 'All campaigns' : 'Active campaign only'}</button></div>
      </div>
      {isTagSearch && <section className="mb-6"><div className="mb-3 flex items-center gap-2"><Tags size={15} className="text-brass-300"/><h2 className="font-display text-lg text-parchment">Records tagged <span className="text-brass-300">[{tagName}]</span></h2></div><p className="mb-3 text-[10px] text-white/35">These records have this exact tag. Similar tags below are based on tags found on the same records.</p></section>}
      {!query.trim() ? <div className="panel-card flex flex-col items-center px-6 py-14 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brass-300/15 bg-brass-300/[.06] text-brass-300"><Search size={20}/></div><h2 className="mt-4 font-display text-xl text-parchment">What are you looking for?</h2><p className="mt-2 max-w-sm text-xs leading-5 text-white/35">Search for a phrase, a character’s name, or click any bracketed tag to explore connected campaign notes.</p></div> : isTagSearch ? <SearchResultList results={filteredResults} onOpen={onOpenResult} onTagsChange={onResultTags} onTagClick={onTagClick} /> : <div className="space-y-7">{textResults.length > 0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg text-parchment">Text matches</h2><span className="text-[10px] text-white/30">{textResults.length}</span></div><SearchResultList results={textResults} onOpen={onOpenResult} onTagsChange={onResultTags} onTagClick={onTagClick} highlightTerm={query}/></section>}{tagResults.length > 0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg text-parchment">Matching tags</h2><span className="text-[10px] text-white/30">{tagResults.length}</span></div><SearchResultList results={tagResults} onOpen={onOpenResult} onTagsChange={onResultTags} onTagClick={onTagClick}/></section>}{!filteredResults.length && <SearchResultList results={[]} onOpen={onOpenResult} onTagsChange={onResultTags} onTagClick={onTagClick}/>}</div>}
      {isTagSearch && relatedTags.length > 0 && <section className="mt-7"><div className="mb-3 flex items-center gap-2"><Tags size={14} className="text-brass-300/80"/><h2 className="font-display text-lg text-parchment">Similar tags</h2></div><p className="mb-3 text-[10px] text-white/35">Tags that appear alongside [{tagName}] on other records.</p><div className="flex flex-wrap gap-2">{relatedTags.map(tag => <button key={tag.name} onClick={() => onTagClick(tag.name)} className="group flex items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.025] px-3 py-2 text-left transition hover:border-brass-300/25 hover:bg-brass-400/[.06]"><span className="text-[11px] text-brass-200">[{tag.name}]</span><span className="text-[9px] text-white/30">{tag.count}</span><ArrowUpRight size={11} className="text-white/20 group-hover:text-brass-300"/></button>)}</div></section>}
      {isTagSearch && !relatedTags.length && !searching && <p className="mt-6 text-[10px] text-white/25">No related tags found yet. Tags become connected when they are used on the same record.</p>}
    </div>
  </div>
}
