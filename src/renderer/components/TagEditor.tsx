import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => void
  compact?: boolean
  placeholder?: string
  dataTagInput?: string
}

export function TagEditor({ tags, onChange, compact = false, placeholder = 'Add a tag…', dataTagInput }: TagEditorProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focus = () => inputRef.current?.focus()
    window.addEventListener('spellbook:focus-tags', focus)
    return () => window.removeEventListener('spellbook:focus-tags', focus)
  }, [])
  const add = () => {
    const tag = draft.trim().replace(/^#/, '').replace(/\s+/g, '-')
    if (!tag) return
    if (!tags.some(t => t.toLocaleLowerCase() === tag.toLocaleLowerCase())) onChange([...tags, tag.slice(0, 32)])
    setDraft('')
  }
  const remove = (tag: string) => onChange(tags.filter(t => t !== tag))
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'min-h-6' : 'min-h-8'}`}>
      {tags.map(tag => <span key={tag} className={`tag-chip group ${compact ? 'tag-chip-compact' : ''}`}>
        <span className="text-brass-300">#</span>{tag}
        <button type="button" className="tag-remove" title={`Remove tag ${tag}`} onClick={() => remove(tag)}><X size={11} /></button>
      </span>)}
      <div className="flex min-w-[94px] flex-1 items-center gap-1">
        <input ref={inputRef} data-tag-input={dataTagInput} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } if (e.key === 'Backspace' && !draft && tags.length) remove(tags[tags.length - 1]) }}
          onBlur={add} placeholder={placeholder} className={`tag-input ${compact ? 'text-[11px]' : 'text-xs'}`} aria-label="Add a tag" />
        {draft.trim() && <button type="button" title="Add tag" onMouseDown={e => e.preventDefault()} onClick={add} className="text-brass-300 hover:text-brass-400"><Plus size={13} /></button>}
      </div>
    </div>
  )
}
