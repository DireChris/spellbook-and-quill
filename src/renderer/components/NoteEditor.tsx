import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Bold, Heading1, Heading2, Italic, List, ListOrdered, Quote, Save, Sparkles, Tag, Trash2, Underline as UnderlineIcon, Strikethrough, Code2, Link2, Undo2, Redo2 } from 'lucide-react'
import type { Note } from '../../shared/types'
import { TagEditor } from './TagEditor'

const BracketTagDecoration = Extension.create({
  name: 'bracketTagDecoration',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('bracketTagDecoration'),
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            for (const match of node.text.matchAll(/\[([^\]\n]{1,64})\]/gu)) {
              const start = pos + (match.index ?? 0)
              decorations.push(Decoration.inline(start, start + match[0].length, { class: 'inline-tag-token', 'data-tag': match[1].trim() }))
            }
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    })]
  },
})

interface NoteEditorProps {
  note: Note
  knownTags: string[]
  onTitleChange: (title: string) => void
  onSessionNumberChange: (sessionNumber: number | null) => void
  onContentChange: (html: string) => void
  onTagsChange: (tags: string[]) => void
  onTagClick: (tag: string) => void
  onDelete: () => void
  saving: boolean
  onSaveNow: () => void
}

export function NoteEditor({ note, knownTags, onTitleChange, onSessionNumberChange, onContentChange, onTagsChange, onTagClick, onDelete, saving, onSaveNow }: NoteEditorProps) {
  const [tagPicker, setTagPicker] = useState<{ query: string; from: number; to: number } | null>(null)
  const syncedTagsRef = useRef<string[]>(note.tags.slice())
  useEffect(() => { syncedTagsRef.current = note.tags.slice() }, [note.id, note.tags.join('|')])
  const syncInlineTags = useCallback((editor: any) => {
    const text = editor.getText({ blockSeparator: '\n' })
    const tokens = [...text.matchAll(/\[([^\]\n]{1,64})\]/gu)].map(match => match[1].trim()).concat([...text.matchAll(/#([\p{L}\p{N}_-]{1,32})(?=\s|[.,!?;:)\]\}])/gu)].map(match => match[1]))
    const merged = syncedTagsRef.current.slice()
    for (const token of tokens) if (!merged.some(tag => tag.toLocaleLowerCase() === token.toLocaleLowerCase())) merged.push(token)
    if (merged.length !== syncedTagsRef.current.length) { syncedTagsRef.current = merged; onTagsChange(merged) }
  }, [onTagsChange])
  const checkTagPrefix = useCallback((editor: any) => {
    const { $from, from } = editor.state.selection
    const before = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
    const match = before.match(/(?:^|\s)\[([^\]\n]*)$/u)
    if (match) setTagPicker({ query: match[1], from: from - match[1].length - 1, to: from })
    else setTagPicker(null)
  }, [])
  const editorRef = useRef<any>(null)
  const onTagClickRef = useRef(onTagClick)
  onTagClickRef.current = onTagClick
  const editor = useEditor({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }), BracketTagDecoration],
    content: note.content || '<p></p>',
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': 'Session note editor', class: 'prose-note outline-none min-h-[320px]' },
      handleClick: (view, pos, event) => {
        const resolved = view.state.doc.resolve(pos)
        const text = resolved.parent.textContent
        const offset = resolved.parentOffset
        const token = [...text.matchAll(/\[([^\]\n]{1,64})\]/gu)].find(match => offset >= match.index! && offset <= match.index! + match[0].length)
        if (token) { event.preventDefault(); onTagClickRef.current(token[1].trim()); return true }
        return false
      },
      handleKeyDown: (_view, event) => {
        if (tagPicker && event.key === 'Escape') { setTagPicker(null); return true }
        if (tagPicker && event.key === 'Enter') {
          event.preventDefault()
          const candidate = knownTags.filter(tag => tag.toLocaleLowerCase().includes(tagPicker.query.toLocaleLowerCase()))[0] || tagPicker.query
          if (candidate) editorRef.current?.chain().focus().insertContentAt({ from: tagPicker.from, to: tagPicker.to }, `[${candidate}] `).run()
          setTagPicker(null)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => { onContentChange(editor.getHTML()); checkTagPrefix(editor); syncInlineTags(editor) },
    onSelectionUpdate: ({ editor }) => checkTagPrefix(editor),
  }, [note.id])

  editorRef.current = editor

  const candidates = useMemo(() => knownTags.filter(tag => tag.toLocaleLowerCase().includes((tagPicker?.query || '').toLocaleLowerCase())).slice(0, 5), [knownTags, tagPicker])
  const insertTag = (tag: string) => {
    if (tagPicker && editor) editor.chain().focus().insertContentAt({ from: tagPicker.from, to: tagPicker.to }, `[${tag}] `).run()
    setTagPicker(null)
  }
  const ToolbarButton = ({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" title={title} onMouseDown={event => event.preventDefault()} onClick={onClick} className={`toolbar-button ${active ? 'toolbar-button-active' : ''}`}>{children}</button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/[.07] px-6 pb-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.23em] text-brass-400"><Sparkles size={13} /> Field Journal <span className="text-white/20">/</span> {note.kind}</div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-white/35"><span className={`h-1.5 w-1.5 rounded-full ${saving ? 'bg-amber-400' : 'bg-emerald-400'}`} />{saving ? 'Saving…' : 'Saved locally'}</span>
            <button onClick={onSaveNow} title="Save now" className="icon-button"><Save size={14} /></button>
            {note.id > 0 && <button onClick={onDelete} title="Delete note" className="icon-button hover:!text-rose-300"><Trash2 size={14} /></button>}
          </div>
        </div>
        <div className="flex items-center gap-4"><input value={note.title} onChange={e => onTitleChange(e.target.value)} placeholder="Untitled chronicle" className="min-w-0 flex-1 bg-transparent font-display text-[27px] tracking-[-.03em] text-parchment outline-none placeholder:text-white/20" />{note.kind === 'session' && <label className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[.12em] text-white/40"><span>Session #</span><input aria-label="Session number" type="number" min={1} step={1} value={note.sessionNumber ?? ''} onChange={event => { const raw = event.target.value; onSessionNumberChange(raw.trim() === '' ? null : Math.max(1, Math.floor(Number(raw)))) }} className="w-[72px] rounded-lg border border-white/10 bg-white/[.035] px-2 py-2 text-sm normal-case tracking-normal text-parchment outline-none focus:border-brass-400/50" placeholder="—" /></label>}</div>
        <div className="mt-4 flex items-center gap-3"><Tag size={13} className="shrink-0 text-white/35" /><div className="flex-1"><TagEditor tags={note.tags} onChange={onTagsChange} onTagClick={onTagClick} dataTagInput="note" placeholder="Add tags · Ctrl+T" /></div></div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="editor-toolbar flex flex-wrap items-center gap-1 border-b border-white/[.06] px-6 py-2">
          <ToolbarButton title="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></ToolbarButton>
          <ToolbarButton title="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></ToolbarButton>
          <ToolbarButton title="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></ToolbarButton>
          <ToolbarButton title="Strikethrough" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></ToolbarButton>
          <ToolbarButton title="Inline code" active={editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()}><Code2 size={15} /></ToolbarButton>
          <ToolbarButton title="Link / unlink" active={editor?.isActive('link')} onClick={() => { if (!editor) return; const href = editor.getAttributes('link').href; if (href) editor.chain().focus().unsetLink().run(); else { const url = window.prompt('Enter a link URL (https://…)'); if (url) editor.chain().focus().setLink({ href: url }).run() } }}><Link2 size={15} /></ToolbarButton>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <ToolbarButton title="Heading 1" active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></ToolbarButton>
          <ToolbarButton title="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></ToolbarButton>
          <ToolbarButton title="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></ToolbarButton>
          <ToolbarButton title="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton title="Read-aloud callout" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></ToolbarButton>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <ToolbarButton title="Undo" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></ToolbarButton>
          <div className="ml-auto text-[10px] text-white/25">Tip: type <span className="text-brass-300">[</span>tag name<span className="text-brass-300">]</span> to tag · native spell-check enabled</div>
        </div>
        <div className="relative flex-1 overflow-y-auto px-6 py-5 md:px-9">
          <EditorContent editor={editor} />
          {tagPicker && <div className="tag-picker" role="listbox" aria-label="Quick tag suggestions">
            <div className="mb-1 px-2 text-[9px] uppercase tracking-[.18em] text-white/35">Quick tag</div>
            {candidates.map(tag => <button key={tag} onMouseDown={e => e.preventDefault()} onClick={() => insertTag(tag)} className="tag-picker-item"><span className="text-brass-300">[</span>{tag}<span className="text-brass-300">]</span></button>)}
            {tagPicker.query && !knownTags.some(t => t.toLocaleLowerCase() === tagPicker.query.toLocaleLowerCase()) && <button onMouseDown={e => e.preventDefault()} onClick={() => insertTag(tagPicker.query)} className="tag-picker-item text-brass-300">Create “[{tagPicker.query}]”</button>}
            {!candidates.length && !tagPicker.query && <div className="px-2 py-1.5 text-xs text-white/40">Type a tag name or press Enter to create one.</div>}
          </div>}
          <div className="mt-10 border-t border-white/[.06] pt-4 text-[10px] text-white/25">Only stored on this device · Use callouts for text intended to be read aloud</div>
        </div>
      </div>
    </div>
  )
}
