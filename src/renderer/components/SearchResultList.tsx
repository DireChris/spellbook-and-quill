import { BookOpen, Coins, ScrollText, StickyNote, Tags, Users, ChevronRight } from 'lucide-react'
import type { SearchResult } from '../../shared/types'
import { TagEditor } from './TagEditor'

interface Props { results: SearchResult[]; onOpen: (result: SearchResult) => void; onTagsChange: (result: SearchResult, tags: string[]) => void; onTagClick?: (tag: string) => void; highlightTerm?: string; compact?: boolean }
const icon = { note: ScrollText, quest: BookOpen, scratch: StickyNote, npc: Users, npc_log: Users, loot: Coins }
const category = { note: 'Session note', quest: 'Quest', scratch: 'Scratch pad', npc: 'NPC', npc_log: 'NPC log', loot: 'Vault item' }
const badgeClass = { note: 'border-sky-300/15 bg-sky-300/[.06] text-sky-200/80', quest: 'border-amber-300/15 bg-amber-300/[.06] text-amber-200/80', scratch: 'border-violet-300/15 bg-violet-300/[.06] text-violet-200/80', npc: 'border-emerald-300/15 bg-emerald-300/[.06] text-emerald-200/80', npc_log: 'border-teal-300/15 bg-teal-300/[.06] text-teal-200/80', loot: 'border-brass-300/15 bg-brass-300/[.06] text-brass-200/80' }
export function SearchResultList({ results, onOpen, onTagsChange, onTagClick, highlightTerm = '', compact = false }: Props) {
  const renderExcerpt = (excerpt: string, term?: string) => { const needle = term || highlightTerm; if (!needle) return excerpt || 'No preview text available.'; const index = excerpt.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()); if (index < 0) return excerpt || 'No preview text available.'; return <>{excerpt.slice(0,index)}<mark className="search-match">{excerpt.slice(index,index+needle.length)}</mark>{excerpt.slice(index+needle.length)}</> }
  if (!results.length) return <div className="px-4 py-8 text-center"><div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/[.04] text-white/25"><Tags size={16} /></div><p className="mt-3 text-xs text-white/45">No matching entries yet.</p><p className="mt-1 text-[10px] text-white/25">Try a person, place, quest name, or tag.</p></div>
  return <div className={compact ? 'space-y-1' : 'grid gap-3 sm:grid-cols-2'}>
    {results.map(result => {
      const Icon = icon[result.entityType]
      return <article key={`${result.campaignId ?? 'active'}-${result.entityType}-${result.id}`} className={`search-result-card ${compact ? 'search-result-card-compact' : ''}`}>
        <button onClick={() => onOpen(result)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[.07] bg-white/[.035] text-brass-300"><Icon size={15} /></div>
          <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-1.5"><span className={`rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-[.1em] ${badgeClass[result.entityType]}`}>{category[result.entityType]}</span>{result.meta && <span className="rounded bg-white/[.04] px-1.5 py-0.5 text-[9px] text-white/35">{result.meta}</span>}{result.campaignName && <span className="rounded bg-brass-400/[.07] px-1.5 py-0.5 text-[9px] text-brass-200/70">{result.campaignName}</span>}</div><h4 className="truncate text-xs font-medium text-parchment">{result.title}</h4><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/40">{renderExcerpt(result.excerpt, result.matchTerm)}</p></div>
          <ChevronRight size={13} className="mt-1 shrink-0 text-white/20" />
        </button>
        <div className="mt-2 border-t border-white/[.05] pt-2"><div className="mb-1 text-[9px] uppercase tracking-[.12em] text-white/25">Edit tags</div><TagEditor tags={result.tags} compact onChange={tags => onTagsChange(result, tags)} onTagClick={onTagClick} placeholder="Add tag…" /></div>
      </article>
    })}
  </div>
}
