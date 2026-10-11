import type { ReactNode } from 'react'
import { ArrowUpRight, BookOpen, ChevronRight, Clock3, Compass, Download, Gem, MapPinned, Sparkles, Users } from 'lucide-react'
import type { DashboardData, Note, Quest } from '../../shared/types'
import type { PageKey } from '../components/Sidebar'

interface Props { data: DashboardData; onNavigate: (page: PageKey) => void; onOpenNote: (note: Note) => void; onOpenQuest: (quest: Quest) => void; onExportWord: () => void }
const excerpt = (content: string) => content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const dateLabel = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(date))
export function DashboardPage({ data, onNavigate, onOpenNote, onOpenQuest, onExportWord }: Props) {
  const activeQuests = data.quests.filter(q => q.status === 'In Progress').length
  const completedObjectives = data.quests.reduce((sum, q) => sum + q.objectives.filter(o => o.done).length, 0)
  const totalObjectives = data.quests.reduce((sum, q) => sum + q.objectives.length, 0)
  const totalGpValue = data.currency.pp * 10 + data.currency.gp + data.currency.sp / 10 + data.currency.cp / 100
  return (
    <div className="page-enter space-y-6 p-6 xl:p-8">
      <div className={`dashboard-hero relative overflow-hidden rounded-2xl border border-brass-400/15 p-6 md:p-8 ${data.campaign.imageData ? 'dashboard-hero-with-image' : ''}`}>
        {data.campaign.imageData && <img src={data.campaign.imageData} alt="" className="dashboard-campaign-image" />}
        {data.campaign.imageData && <div className="dashboard-campaign-scrim" />}
        <div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" />
        <div className="relative z-10 max-w-[600px]">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.22em] text-brass-300"><Sparkles size={13} /> Active campaign <span className="text-white/20">/</span> {data.campaign.setting || data.campaign.ruleset}</div>
          <h1 className="font-display text-3xl leading-tight tracking-[-.035em] text-parchment md:text-[38px]">{data.campaign.name}</h1>
          <p className="mt-3 max-w-[480px] text-xs leading-6 text-white/55">{data.campaign.description || 'A quiet place for tangled clues, unfinished quests, and the little details that become legends.'}</p>
          <div className="mt-6 flex flex-wrap gap-2.5"><button onClick={() => onNavigate('notes')} className="primary-button"><BookOpen size={14} /> Open journal</button><button onClick={() => onNavigate('quests')} className="secondary-button"><Compass size={14} /> View quest log</button><button onClick={() => onNavigate('campaigns')} className="secondary-button"><Users size={14} /> Campaigns</button><button onClick={onExportWord} className="secondary-button"><Download size={14} /> Export Word</button></div>
        </div>
        <div className="hero-sigil" aria-hidden="true"><div className="hero-sigil-inner"><Sparkles size={34} strokeWidth={1} /></div></div>
        <div className="absolute bottom-0 right-0 h-px w-2/3 bg-gradient-to-l from-brass-400/25 to-transparent" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<BookOpen size={15} />} label="Journal entries" value={data.notes.length} note={`${data.notes.filter(n=>n.kind==='session').length} session records`} accent="amber" />
        <MetricCard icon={<Compass size={15} />} label="Active quests" value={activeQuests} note={`${data.quests.filter(q=>q.status==='Completed').length} completed`} accent="sage" />
        <MetricCard icon={<Users size={15} />} label="Known faces" value={data.npcs.length} note="NPCs & faction contacts" accent="blue" />
        <MetricCard icon={<Gem size={15} />} label="Vault value" value={`${Math.round(totalGpValue).toLocaleString()} gp`} note={`${data.loot.reduce((n,item)=>n+item.quantity,0)} items catalogued`} accent="violet" />
      </div>
      <div className="grid gap-5 2xl:grid-cols-[1.2fr_.8fr]">
        <section className="panel-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4"><div><div className="section-eyebrow">Fresh from the journal</div><h2 className="mt-1 font-display text-lg text-parchment">Recently updated</h2></div><button onClick={() => onNavigate('notes')} className="inline-link">All notes <ArrowUpRight size={13} /></button></div>
          <div className="divide-y divide-white/[.05]">
            {data.notes.slice(0, 4).map((note, i) => <button key={note.id} onClick={() => onOpenNote(note)} className="recent-row group flex w-full items-start gap-3.5 px-5 py-4 text-left">
              <div className={`recent-note-mark ${i===0?'recent-note-mark-active':''}`}><BookOpen size={15} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-medium text-parchment group-hover:text-brass-300">{note.title}</h3><span className="rounded bg-white/[.04] px-1.5 py-0.5 text-[8px] uppercase tracking-[.12em] text-white/35">{note.kind}</span></div><p className="mt-1.5 line-clamp-2 text-[10px] leading-5 text-white/40">{excerpt(note.content) || 'An empty page awaits its first detail.'}</p><div className="mt-2 flex flex-wrap gap-1.5">{note.tags.slice(0,3).map(tag=><span key={tag} className="tag-chip tag-chip-compact"><span className="text-brass-300">#</span>{tag}</span>)}</div></div><div className="flex shrink-0 items-center gap-1 pt-1 text-[9px] text-white/25"><Clock3 size={10} />{dateLabel(note.updatedAt)}<ChevronRight size={12} className="ml-1 opacity-0 transition group-hover:opacity-100" /></div>
            </button>)}
            {!data.notes.length && <EmptyInline text="Your journal is waiting for its first entry." action="Create note" onClick={() => onNavigate('notes')} />}
          </div>
        </section>
        <section className="panel-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4"><div><div className="section-eyebrow">Current threads</div><h2 className="mt-1 font-display text-lg text-parchment">Quest board</h2></div><button onClick={() => onNavigate('quests')} className="inline-link">Quest log <ArrowUpRight size={13} /></button></div>
          <div className="p-3">
            {data.quests.slice(0, 4).map(quest => {
              const done = quest.objectives.filter(o=>o.done).length; const total = quest.objectives.length
              return <button key={quest.id} onClick={() => onOpenQuest(quest)} className="quest-board-row group w-full rounded-xl px-3 py-3 text-left hover:bg-white/[.025]">
                <div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brass-400/15 bg-brass-500/[.07] text-brass-300"><MapPinned size={14} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-xs font-medium text-parchment group-hover:text-brass-300">{quest.name}</h3><StatusPill status={quest.status} /></div><div className="mt-1 text-[10px] text-white/35">{quest.giver || 'Unknown patron'}</div><div className="mt-3 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-sage" style={{width:`${total ? done / total * 100 : 0}%`}} /></div><span className="text-[9px] tabular-nums text-white/35">{done}/{total}</span></div></div></div>
              </button>
            })}
            {!data.quests.length && <EmptyInline text="No open threads to follow yet." action="Add a quest" onClick={() => onNavigate('quests')} />}
          </div>
          <div className="mx-5 border-t border-white/[.06] py-4"><div className="flex items-center justify-between text-[10px]"><span className="text-white/40">Objectives resolved</span><span className="text-parchment">{completedObjectives} <span className="text-white/25">/ {totalObjectives}</span></span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-sage/60 to-sage" style={{width:`${totalObjectives ? completedObjectives/totalObjectives*100 : 0}%`}} /></div></div>
        </section>
      </div>
      <div className="flex items-center justify-center gap-2 pb-2 text-[10px] text-white/20"><Sparkles size={11} className="text-brass-400/60" /> Your stories stay on this device. Your next great session starts here.</div>
    </div>
  )
}

function MetricCard({icon,label,value,note,accent}:{icon:ReactNode;label:string;value:string|number;note:string;accent:string}) {
  return <div className="panel-card metric-card p-4"><div className="flex items-start justify-between"><div className="section-eyebrow">{label}</div><div className={`metric-icon metric-${accent}`}>{icon}</div></div><div className="mt-3 font-display text-[26px] leading-none tracking-[-.03em] text-parchment">{value}</div><div className="mt-2 text-[10px] text-white/35">{note}</div></div>
}
function StatusPill({status}:{status:string}) { return <span className={`status-pill status-${status.toLowerCase().replace(/\s/g,'-')}`}>{status}</span> }
function EmptyInline({text,action,onClick}:{text:string;action:string;onClick:()=>void}) { return <div className="px-4 py-8 text-center"><p className="text-xs text-white/40">{text}</p><button className="mt-3 text-[10px] text-brass-300 hover:text-brass-400" onClick={onClick}>{action} →</button></div> }
