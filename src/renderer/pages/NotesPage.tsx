import { useMemo } from 'react'
import { FilePlus2, FileText, Feather, Search, Sparkles } from 'lucide-react'
import type { Note } from '../../shared/types'
import { NoteEditor } from '../components/NoteEditor'

interface Props {
  notes: Note[]; selectedNote: Note | null; knownTags: string[]; saving: boolean
  onSelect: (note: Note) => void; onCreate: () => void; onTitleChange: (title: string) => void
  onContentChange: (content: string) => void; onTagsChange: (tags: string[]) => void; onTagClick: (tag: string) => void; onDelete: () => void; onSaveNow: () => void
}
const excerpt = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
export function NotesPage(props: Props) {
  const current = props.selectedNote
  const sorted = useMemo(() => props.notes.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), [props.notes])
  return (
    <div className="page-enter flex h-full min-h-0 flex-col p-5 xl:p-6">
      <div className="mb-5 flex shrink-0 items-end justify-between gap-4"><div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-brass-300"><Feather size={12} /> The journal</div><h1 className="font-display text-2xl tracking-[-.03em] text-parchment">Session notes</h1><p className="mt-1.5 text-[11px] text-white/40">Record the moment. Keep the clues. Let the legend grow.</p></div><button onClick={props.onCreate} className="primary-button shrink-0"><FilePlus2 size={14} /> New note</button></div>
      <div className="notes-workspace flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[.07] bg-[#11141b]/80">
        <aside className="notes-list flex w-[245px] shrink-0 flex-col border-r border-white/[.06]">
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3"><span className="section-eyebrow">All entries <span className="ml-1 text-white/25">{sorted.length}</span></span><Search size={13} className="text-white/30" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sorted.map(note => <button key={note.id} onClick={() => props.onSelect(note)} className={`note-list-item ${current?.id === note.id ? 'note-list-item-active' : ''}`}>
              <div className="flex items-start gap-2.5"><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${current?.id === note.id ? 'bg-brass-500/15 text-brass-300' : 'bg-white/[.035] text-white/35'}`}><FileText size={13} /></div><div className="min-w-0 flex-1"><h3 className="truncate text-[11px] font-medium text-parchment">{note.title || 'Untitled chronicle'}</h3><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/35">{excerpt(note.content) || 'Blank page'}</p><div className="mt-2 flex flex-wrap items-center gap-1">{note.tags.slice(0,2).map(tag=><span key={tag} role="button" tabIndex={0} onClick={event => { event.stopPropagation(); props.onTagClick(tag) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); props.onTagClick(tag) } }} className="cursor-pointer text-[8px] text-brass-300/70 hover:text-brass-200">[{tag}]</span>)}<span className="ml-auto text-[8px] uppercase tracking-[.1em] text-white/20">{note.kind}</span></div></div></div>
            </button>)}
            {!sorted.length && <div className="px-3 py-8 text-center text-[10px] leading-5 text-white/35">Nothing in the journal yet.<br />Create the first entry.</div>}
          </div>
          <div className="border-t border-white/[.06] px-4 py-3 text-[9px] text-white/25"><Sparkles size={10} className="mr-1 inline text-brass-300/60" />Autosave is local and automatic</div>
        </aside>
        <div className="min-w-0 flex-1">{current ? <NoteEditor key={current.id} note={current} knownTags={props.knownTags} onTitleChange={props.onTitleChange} onContentChange={props.onContentChange} onTagsChange={props.onTagsChange} onTagClick={props.onTagClick} onDelete={props.onDelete} saving={props.saving} onSaveNow={props.onSaveNow} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brass-400/15 bg-brass-500/[.07] text-brass-300"><Feather size={23} /></div><h2 className="mt-4 font-display text-xl text-parchment">A blank page awaits</h2><p className="mt-2 max-w-[280px] text-xs leading-5 text-white/40">Create a session note to record discoveries, dialogue, and all those suspiciously specific details.</p><button onClick={props.onCreate} className="primary-button mt-5"><FilePlus2 size={14} /> Write a note</button></div>}</div>
      </div>
    </div>
  )
}
