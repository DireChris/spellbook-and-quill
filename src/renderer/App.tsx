import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Feather, LoaderCircle } from 'lucide-react'
import type { AbilityInput, CharacterStatsInput, DashboardData, Note, NoteInput, Quest, QuestInput, SearchResult, TagInput } from '../shared/types'
import type { PageKey } from './components/Sidebar'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { ScratchPad } from './components/ScratchPad'
import { VaultPeek } from './components/VaultPeek'
import { CharacterPanel } from './components/CharacterPanel'
import { DashboardPage } from './pages/DashboardPage'
import { NotesPage } from './pages/NotesPage'
import { QuestsPage } from './pages/QuestsPage'
import { VaultPage } from './pages/VaultPage'
import { NpcsPage } from './pages/NpcsPage'
import { CharacterSheetPage } from './pages/CharacterSheetPage'

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [page, setPage] = useState<PageKey>('dashboard')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [loadingError, setLoadingError] = useState('')
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [openQuestId, setOpenQuestId] = useState<number | null>(null)
  const [openNpcId, setOpenNpcId] = useState<number | null>(null)
  const autosaveTimer = useRef<number | null>(null)
  const noteSaveSequence = useRef(0)

  const refreshData = useCallback(async () => {
    const fresh = await window.spellbook.getDashboard()
    setData(fresh)
    return fresh
  }, [])
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error })
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  const persistSnapshot = useCallback(async (snapshot: Note) => {
    const saved = await window.spellbook.saveNote({ id: snapshot.id || undefined, title: snapshot.title, content: snapshot.content, kind: snapshot.kind })
    setData(prev => prev ? ({ ...prev, notes: [saved, ...prev.notes.filter(note => note.id !== saved.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)) }) : prev)
    setSelectedNote(prev => prev && prev.id === snapshot.id ? { ...prev, id: saved.id, updatedAt: saved.updatedAt } : prev)
    return saved
  }, [])

  useEffect(() => {
    let alive = true
    window.spellbook.getDashboard().then(fresh => {
      if (!alive) return
      setData(fresh)
      setSelectedNote(fresh.notes[0] ?? null)
    }).catch(err => { if (alive) setLoadingError(err instanceof Error ? err.message : 'Unable to open the campaign database.') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    const timer = window.setTimeout(() => {
      window.spellbook.search(searchQuery).then(results => setSearchResults(results)).catch(() => setSearchResults([])).finally(() => setSearching(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (page !== 'notes' || !selectedNote) return
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    const snapshot: NoteInput = { id: selectedNote.id || undefined, title: selectedNote.title, content: selectedNote.content, kind: selectedNote.kind }
    const sequence = ++noteSaveSequence.current
    autosaveTimer.current = window.setTimeout(async () => {
      setSavingNote(true)
      try {
        const saved = await window.spellbook.saveNote(snapshot)
        setData(prev => prev ? ({ ...prev, notes: [saved, ...prev.notes.filter(note => note.id !== saved.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)) }) : prev)
        setSelectedNote(prev => {
          if (!prev || prev.id !== (snapshot.id ?? 0)) return prev
          return { ...prev, id: saved.id, updatedAt: saved.updatedAt }
        })
      } catch { notify('Autosave failed. Your changes remain in the editor.', true) }
      finally { if (sequence === noteSaveSequence.current) setSavingNote(false) }
    }, 650)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [page, selectedNote?.id, selectedNote?.title, selectedNote?.content, notify])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
        if (page === 'notes') {
          event.preventDefault()
          window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-tag-input="note"]')?.focus(), 0)
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [page])

  const navigate = useCallback((next: PageKey) => {
    if (page === 'notes' && next !== 'notes' && selectedNote) {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      void persistSnapshot(selectedNote).catch(() => notify('Could not save the latest note changes', true))
    }
    setPage(next); setSearchQuery('')
  }, [page, selectedNote, persistSnapshot, notify])
  const selectNote = useCallback((note: Note) => {
    if (page === 'notes' && selectedNote && selectedNote.id !== note.id) {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      void persistSnapshot(selectedNote).catch(() => notify('Could not save the latest note changes', true))
    }
    setSelectedNote(note)
  }, [page, selectedNote, persistSnapshot, notify])
  const createNote = useCallback(async () => {
    if (page === 'notes' && selectedNote) {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
      await persistSnapshot(selectedNote)
    }
    const note = await window.spellbook.saveNote({ title: 'Untitled chronicle', content: '<p></p>', kind: 'session' })
    setData(prev => prev ? ({ ...prev, notes: [note, ...prev.notes.filter(n=>n.id!==note.id)] }) : prev)
    setSelectedNote(note); setPage('notes'); setSearchQuery('')
  }, [page, selectedNote, persistSnapshot])
  const handleTitleChange = useCallback((title: string) => setSelectedNote(prev => prev ? ({ ...prev, title }) : prev), [])
  const handleContentChange = useCallback((content: string) => setSelectedNote(prev => prev ? ({ ...prev, content }) : prev), [])
  const handleNoteTags = useCallback(async (tags: string[]) => {
    if (!selectedNote?.id) return
    const normalized = await window.spellbook.saveTags({ entityType: 'note', entityId: selectedNote.id, tags })
    setSelectedNote(prev => prev ? ({ ...prev, tags: normalized }) : prev)
    setData(prev => prev ? ({ ...prev, notes: prev.notes.map(note => note.id === selectedNote.id ? { ...note, tags: normalized } : note) }) : prev)
    notify('Note tags updated')
  }, [selectedNote?.id, notify])
  const saveNoteNow = useCallback(async () => {
    if (!selectedNote) return
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    setSavingNote(true)
    try {
      const saved = await window.spellbook.saveNote({ id: selectedNote.id || undefined, title: selectedNote.title, content: selectedNote.content, kind: selectedNote.kind })
      setSelectedNote(prev => prev ? ({ ...prev, id: saved.id, updatedAt: saved.updatedAt }) : prev)
      setData(prev => prev ? ({ ...prev, notes: [saved, ...prev.notes.filter(n=>n.id!==saved.id)] }) : prev)
      notify('Note saved locally')
    } catch { notify('Could not save note', true) } finally { setSavingNote(false) }
  }, [selectedNote, notify])
  const deleteCurrentNote = useCallback(async () => {
    if (!selectedNote || !window.confirm(`Delete “${selectedNote.title}”? This cannot be undone.`)) return
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    await window.spellbook.deleteNote(selectedNote.id)
    const fresh = await refreshData()
    setSelectedNote(fresh.notes[0] ?? null)
    notify('Note deleted')
  }, [selectedNote, refreshData, notify])

  const saveQuest = useCallback(async (input: QuestInput): Promise<Quest> => {
    const saved = await window.spellbook.saveQuest(input)
    await refreshData()
    return saved
  }, [refreshData])
  const deleteQuest = useCallback(async (id: number) => { await window.spellbook.deleteQuest(id); await refreshData(); notify('Quest removed') }, [refreshData, notify])
  const saveNpc = useCallback(async (input: Parameters<typeof window.spellbook.saveNpc>[0]) => { const saved = await window.spellbook.saveNpc(input); await refreshData(); notify('NPC record saved'); return saved }, [refreshData, notify])
  const deleteNpc = useCallback(async (id:number) => { await window.spellbook.deleteNpc(id); await refreshData(); notify('NPC removed') }, [refreshData, notify])
  const saveNpcLog = useCallback(async (input:Parameters<typeof window.spellbook.saveNpcLog>[0]) => { await window.spellbook.saveNpcLog(input); await refreshData(); notify('Encounter added to the log') }, [refreshData, notify])
  const saveScratch = useCallback(async (content:string) => { await window.spellbook.saveScratch(content) }, [])
  const saveCurrency = useCallback(async (currency:NonNullable<DashboardData>['currency']) => { await window.spellbook.saveCurrency(currency); await refreshData(); notify('Currency ledger updated') }, [refreshData, notify])
  const addLoot = useCallback(async (input:Parameters<typeof window.spellbook.addLoot>[0]) => { await window.spellbook.addLoot(input); await refreshData(); notify('Item added to the vault') }, [refreshData, notify])
  const deleteLoot = useCallback(async (id:number) => { await window.spellbook.deleteLoot(id); await refreshData(); notify('Item removed from the vault') }, [refreshData, notify])
  const rollAbility = useCallback(async (id:number) => { const result = await window.spellbook.rollAbility(id); await refreshData(); return result }, [refreshData])
  const saveCharacterSheet = useCallback(async (character: CharacterStatsInput, abilities: AbilityInput[]) => {
    const savedCharacter = await window.spellbook.saveCharacter(character)
    const savedAbilities = await window.spellbook.saveAbilities(abilities)
    await refreshData()
    notify('Character sheet saved locally')
    return { character: savedCharacter, abilities: savedAbilities }
  }, [refreshData, notify])
  const editSearchTags = useCallback(async (result:SearchResult, tags:string[]) => {
    const normalized = await window.spellbook.saveTags({ entityType: result.entityType, entityId: result.id, tags } as TagInput)
    setSearchResults(prev => prev.map(item => item.entityType===result.entityType && item.id===result.id ? {...item,tags:normalized} : item))
    if (result.entityType === 'note') setData(prev => prev ? ({...prev,notes:prev.notes.map(n=>n.id===result.id?{...n,tags:normalized}:n)}) : prev)
    if (result.entityType === 'note' && selectedNote?.id === result.id) setSelectedNote(prev=>prev?({...prev,tags:normalized}):prev)
    notify('Search result tags updated')
  }, [selectedNote?.id, notify])

  const openResult = useCallback((result:SearchResult) => {
    setSearchQuery('')
    if (result.entityType === 'note') {
      navigate('notes')
      const note = data?.notes.find(n=>n.id===result.id)
      if (note) selectNote(note)
    } else if (result.entityType === 'quest') {
      setOpenQuestId(result.id); navigate('quests')
    } else if (result.entityType === 'npc' || result.entityType === 'npc_log') {
      const npcId = result.entityType === 'npc' ? result.id : data?.npcs.find(n=>n.name.toLowerCase()===result.meta?.toLowerCase())?.id
      setOpenNpcId(npcId ?? null); navigate('npcs')
    } else if (result.entityType === 'loot') navigate('vault')
    else navigate('dashboard')
  }, [data, navigate, selectNote])

  const knownTags = useMemo(() => [...new Set((data ? [...data.notes,...data.quests,...data.npcs,...data.npcLogs,...data.loot] : []).flatMap(item=>item.tags).concat(searchResults.flatMap(item=>item.tags)))].sort((a,b)=>a.localeCompare(b)), [data, searchResults])
  if (loadingError) return <div className="flex h-screen items-center justify-center bg-ink-950 p-10 text-center"><div><AlertCircle size={26} className="mx-auto text-rose-300"/><h1 className="mt-4 font-display text-xl text-parchment">Could not open Spellbook &amp; Quill</h1><p className="mt-2 max-w-lg text-sm text-white/50">{loadingError}</p><p className="mt-3 text-xs text-white/30">Try restarting the app. The campaign database is stored in the operating system’s app-data folder.</p></div></div>
  if (!data) return <div className="flex h-screen items-center justify-center bg-ink-950 text-white/50"><LoaderCircle size={17} className="mr-2 animate-spin"/> Opening the campaign archive…</div>

  return (
    <div className="app-shell flex h-screen min-w-[1080px] overflow-hidden bg-ink-950 text-parchment">
      <Sidebar page={page} onNavigate={navigate} counts={{notes:data.notes.length,quests:data.quests.length,npcs:data.npcs.length,loot:data.loot.length}} />
      <div className="main-shell flex min-w-0 flex-1 flex-col">
        <Topbar query={searchQuery} onQueryChange={setSearchQuery} results={searchResults} searching={searching} onOpenResult={openResult} onResultTags={editSearchTags}/>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="min-w-0 flex-1 overflow-hidden">
            {page==='dashboard'&&<div className="h-full overflow-y-auto"><DashboardPage data={data} onNavigate={navigate} onOpenNote={note=>{navigate('notes');selectNote(note)}} onOpenQuest={quest=>{setOpenQuestId(quest.id);navigate('quests')}}/></div>}
            {page==='notes'&&<NotesPage notes={data.notes} selectedNote={selectedNote} knownTags={knownTags} saving={savingNote} onSelect={selectNote} onCreate={()=>void createNote().catch(()=>notify('Could not create a note',true))} onTitleChange={handleTitleChange} onContentChange={handleContentChange} onTagsChange={handleNoteTags} onDelete={()=>void deleteCurrentNote()} onSaveNow={()=>void saveNoteNow()}/>}
            {page==='quests'&&<QuestsPage quests={data.quests} openQuestId={openQuestId} onSave={saveQuest} onDelete={deleteQuest}/>}
            {page==='vault'&&<VaultPage currency={data.currency} loot={data.loot} onCurrencySave={saveCurrency} onAddLoot={addLoot} onDeleteLoot={deleteLoot}/>}
            {page==='npcs'&&<NpcsPage npcs={data.npcs} logs={data.npcLogs} openNpcId={openNpcId} onSaveNpc={saveNpc} onDeleteNpc={deleteNpc} onSaveLog={saveNpcLog}/>}
            {page==='character'&&<CharacterSheetPage character={data.character} abilities={data.abilities} onSave={saveCharacterSheet}/>}
          </main>
          <aside className="right-rail hidden min-h-0 max-h-full w-[302px] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain border-l border-white/[.06] p-4 xl:flex">
            <div className="rail-intro"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.18em] text-brass-300"><Feather size={11}/> Your field kit</div><p className="mt-1 text-[10px] leading-4 text-white/35">Quick references for the other side of the screen.</p></div>
            <CharacterPanel character={data.character} abilities={data.abilities} rolls={data.rolls} onRoll={rollAbility}/>
            <VaultPeek currency={data.currency} itemCount={data.loot.reduce((n,item)=>n+item.quantity,0)} onOpen={()=>navigate('vault')}/>
            <ScratchPad value={data.scratch} onSave={saveScratch}/>
            <div className="flex items-center justify-center gap-1.5 py-1 text-[9px] text-white/20"><CheckCircle2 size={10} className="text-sage/70"/> Private campaign · no account required</div>
          </aside>
        </div>
      </div>
      {toast&&<div className={`toast-message ${toast.error?'toast-error':''}`} role="status">{toast.error?<AlertCircle size={14}/>:<CheckCircle2 size={14}/>}<span>{toast.message}</span></div>}
    </div>
  )
}
