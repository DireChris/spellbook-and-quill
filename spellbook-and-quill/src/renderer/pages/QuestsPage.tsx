import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Check, Circle, Flag, Plus, Save, ScrollText, Trash2, X } from 'lucide-react'
import type { Quest, QuestInput, QuestStatus } from '../../shared/types'

interface Props { quests: Quest[]; openQuestId?: number | null; onSave: (quest: QuestInput) => Promise<Quest>; onDelete: (id: number) => Promise<void>; onTagClick: (tag: string) => void }
const emptyQuest = (): QuestInput => ({ name: '', giver: '', status: 'In Progress', rewards: '', notes: '', objectives: [{ title: '', done: false, isSide: false }] })
function draftFromQuest(q: Quest): QuestInput { return { id:q.id,name:q.name,giver:q.giver,status:q.status,rewards:q.rewards,notes:q.notes,objectives:q.objectives.map(o=>({id:o.id,title:o.title,done:o.done,isSide:o.isSide})) } }
const statusOptions: QuestStatus[] = ['In Progress','Completed','Failed','On Hold']
export function QuestsPage({ quests, openQuestId, onSave, onDelete, onTagClick }: Props) {
  const [draft, setDraft] = useState<QuestInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'All' | QuestStatus>('All')
  useEffect(() => { if (draft?.id && !quests.some(q=>q.id===draft.id)) setDraft(null) }, [quests, draft?.id])
  useEffect(() => { if (openQuestId) { const found = quests.find(q => q.id === openQuestId); if (found) setDraft(draftFromQuest(found)) } }, [openQuestId])
  const shown = quests.filter(q => filter==='All' || q.status===filter)
  const update = <K extends keyof QuestInput>(key: K, value: QuestInput[K]) => setDraft(prev => prev ? { ...prev, [key]: value } : prev)
  const updateObjective = (index: number, change: Partial<QuestInput['objectives'][number]>) => setDraft(prev => prev ? ({ ...prev, objectives: prev.objectives.map((o,i) => i===index ? { ...o, ...change } : o) }) : prev)
  const save = async () => { if (!draft?.name.trim()) return; setBusy(true); try { await onSave({ ...draft, objectives:draft.objectives.filter(o=>o.title.trim()) }); setDraft(null) } finally { setBusy(false) } }
  const remove = async () => { if (!draft?.id) return; if (!window.confirm(`Delete “${draft.name}”? This also removes its objectives.`)) return; await onDelete(draft.id); setDraft(null) }
  return (
    <div className="page-enter h-full overflow-y-auto p-6 xl:p-8">
      <div className="mb-6 flex items-end justify-between gap-4"><div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-brass-300"><Flag size={12} /> Leads &amp; promises</div><h1 className="font-display text-2xl tracking-[-.03em] text-parchment">Quest log</h1><p className="mt-1.5 text-[11px] text-white/40">A promise made is a thread worth following.</p></div><button onClick={() => setDraft(emptyQuest())} className="primary-button shrink-0"><Plus size={14} /> New quest</button></div>
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-1.5">{(['All',...statusOptions] as Array<'All'|QuestStatus>).map(option=><button key={option} onClick={()=>setFilter(option)} className={`filter-chip ${filter===option?'filter-chip-active':''}`}>{option}{option==='All'&&<span className="ml-1 opacity-50">{quests.length}</span>}</button>)}</div>
          <div className="space-y-3">
            {shown.map(quest => {
              const objectivesDone = quest.objectives.filter(o=>o.done).length
              return <article key={quest.id} className="panel-card p-4 transition hover:border-white/[.12]">
                <div className="flex items-start gap-3"><div className="quest-seal"><BookOpen size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg text-parchment">{quest.name}</h2><span className={`status-pill status-${quest.status.toLowerCase().replace(/\s/g,'-')}`}>{quest.status}</span></div><div className="mt-1 text-[10px] text-white/40">Given by <span className="text-white/60">{quest.giver || 'Unknown patron'}</span></div></div><button onClick={()=>setDraft(draftFromQuest(quest))} className="secondary-button !px-3 !py-2"><ScrollText size={12}/> Edit</button></div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_.72fr]">
                  <div><div className="mb-2 flex items-center justify-between"><span className="section-eyebrow">Objectives</span><span className="text-[9px] text-white/35">{objectivesDone}/{quest.objectives.length}</span></div><div className="space-y-1.5">
                    {quest.objectives.slice(0,4).map(obj=><button key={obj.id} onClick={()=>void onSave({id:quest.id,name:quest.name,giver:quest.giver,status:quest.status,rewards:quest.rewards,notes:quest.notes,objectives:quest.objectives.map(o=>({id:o.id,title:o.title,done:o.id===obj.id?!o.done:o.done,isSide:o.isSide}))})} className="flex w-full items-start gap-2.5 rounded-md px-1 py-1 text-left hover:bg-white/[.025]"><span className={`mt-0.5 ${obj.done?'text-sage':'text-white/25'}`}>{obj.done?<Check size={13}/>:<Circle size={13}/>}</span><span className={`text-[10px] leading-4 ${obj.done?'text-white/30 line-through':'text-white/65'}`}>{obj.title}{obj.isSide&&<span className="ml-1.5 rounded bg-white/[.04] px-1 py-0.5 text-[8px] text-white/30">SIDE</span>}</span></button>)}
                    {quest.objectives.length>4&&<div className="pl-6 text-[9px] text-white/30">+{quest.objectives.length-4} more objectives</div>}
                    {!quest.objectives.length&&<p className="text-[10px] text-white/25">No objectives logged.</p>}
                  </div></div>
                  <div className="rounded-lg border border-white/[.05] bg-black/15 p-3"><div className="section-eyebrow mb-2">Reward &amp; notes</div><p className="whitespace-pre-wrap text-[10px] leading-5 text-white/55">{quest.rewards || 'Reward unknown'}{quest.notes ? `\n\n${quest.notes}` : ''}</p><div className="mt-3 flex flex-wrap gap-1">{quest.tags.map(t=><button key={t} type="button" onClick={() => onTagClick(t)} className="tag-chip tag-chip-compact tag-clickable">[{t}]</button>)}</div></div>
                </div>
              </article>
            })}
            {!shown.length&&<div className="panel-card px-5 py-12 text-center"><Flag size={22} className="mx-auto text-white/20"/><h3 className="mt-3 font-display text-lg text-parchment">No quests in this chapter</h3><p className="mt-1 text-xs text-white/35">Choose another status or add a new quest.</p></div>}
          </div>
        </section>
        <aside className="panel-card overflow-hidden 2xl:sticky 2xl:top-0">
          <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4"><div><div className="section-eyebrow">Quest record</div><h2 className="mt-1 font-display text-lg text-parchment">{draft?.id ? 'Edit quest' : 'New objective'}</h2></div>{draft&&<button onClick={()=>setDraft(null)} title="Close form" className="icon-button"><X size={14}/></button>}</div>
          {!draft ? <div className="px-5 py-8 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-brass-400/15 bg-brass-500/[.07] text-brass-300"><ScrollText size={19}/></div><p className="mx-auto mt-3 max-w-[210px] text-xs leading-5 text-white/40">Choose a quest to edit it, or record a new thread when your party hears a rumour.</p><button className="secondary-button mt-4" onClick={()=>setDraft(emptyQuest())}><Plus size={13}/> Create quest</button></div> : <div className="space-y-4 p-5">
            <Field label="Quest name"><input autoFocus value={draft.name} onChange={e=>update('name',e.target.value)} placeholder="A promise in the dark…" className="field-input" /></Field>
            <Field label="Giver / faction"><input value={draft.giver} onChange={e=>update('giver',e.target.value)} placeholder="Who set this in motion?" className="field-input" /></Field>
            <Field label="Status"><select value={draft.status} onChange={e=>update('status',e.target.value as QuestStatus)} className="field-input">{statusOptions.map(s=><option key={s}>{s}</option>)}</select></Field>
            <Field label="Rewards"><textarea value={draft.rewards} onChange={e=>update('rewards',e.target.value)} placeholder="XP, gold, favours, odd trinkets…" rows={2} className="field-input resize-y" /></Field>
            <Field label="Quest notes"><textarea value={draft.notes} onChange={e=>update('notes',e.target.value)} placeholder="Locations, updates, conditions…" rows={3} className="field-input resize-y" /></Field>
            <div><div className="mb-2 flex items-center justify-between"><label className="field-label">Objectives</label><button onClick={()=>update('objectives',[...draft.objectives,{title:'',done:false,isSide:false}])} className="text-[10px] text-brass-300 hover:text-brass-400"><Plus size={11} className="mr-1 inline"/>Add</button></div>
              <div className="space-y-2">{draft.objectives.map((o,index)=><div key={`${o.id??'new'}-${index}`} className="flex items-start gap-2 rounded-lg border border-white/[.06] bg-black/15 p-3"><div className="min-w-0 flex-1"><input value={o.title} onChange={e=>updateObjective(index,{title:e.target.value})} className="w-full bg-transparent py-1 text-[10px] text-parchment outline-none placeholder:text-white/25" placeholder="Describe the objective"/><label className="mt-2 flex cursor-pointer items-center gap-2 text-[10px] text-white/55"><input type="checkbox" checked={o.isSide} onChange={e=>updateObjective(index,{isSide:e.target.checked})} className="accent-[#d3b46e]"/>Is this objective a side quest?</label></div><button onClick={()=>update('objectives',draft.objectives.filter((_,i)=>i!==index))} title="Remove objective" aria-label={`Remove objective ${index+1}`} className="mt-1 text-white/25 hover:text-rose-300"><X size={12}/></button></div>)}</div>
              <p className="mt-2 text-[9px] leading-4 text-white/30">Objectives start incomplete. Mark them complete from the quest card during play.</p>
            </div>
            <div className="flex gap-2 pt-1"><button disabled={busy||!draft.name.trim()} onClick={()=>void save()} className="primary-button flex-1 justify-center disabled:opacity-40"><Save size={13}/>{busy?'Saving…':'Save quest'}</button>{draft.id&&<button onClick={()=>void remove()} title="Delete quest" className="icon-button h-9 w-9 shrink-0 hover:!text-rose-300"><Trash2 size={14}/></button>}</div>
          </div>}
        </aside>
      </div>
    </div>
  )
}
function Field({label,children}:{label:string;children:ReactNode}) { return <div><label className="field-label mb-1.5 block">{label}</label>{children}</div> }
