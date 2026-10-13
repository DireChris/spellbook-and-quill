import { useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Dices, Heart, Shield, Sparkles, Swords, Wind } from 'lucide-react'
import type { Ability, CharacterStats, RollLog } from '../../shared/types'

interface CharacterPanelProps {
  character: CharacterStats
  abilities: Ability[]
  rolls: RollLog[]
  onRoll: (id: number) => Promise<RollLog>
}
const abilityScore = (name: string, score: number) => ({ name, score, modifier: Math.floor((score - 10) / 2) })
const modText = (n: number) => n >= 0 ? `+${n}` : `${n}`

export function CharacterPanel({ character, abilities, rolls, onRoll }: CharacterPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [rolling, setRolling] = useState<number | null>(null)
  const [latest, setLatest] = useState<RollLog | null>(null)
  const scores = [abilityScore('STR', character.str), abilityScore('DEX', character.dex), abilityScore('CON', character.con), abilityScore('INT', character.int), abilityScore('WIS', character.wis), abilityScore('CHA', character.cha)]
  const roll = async (id: number) => {
    setRolling(id)
    try { setLatest(await onRoll(id)) } finally { setRolling(null) }
  }
  return (
    <section className="panel-card shrink-0 overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)} className="flex w-full items-center justify-between border-b border-white/[.06] px-4 py-3 text-left">
        <div className="flex items-center gap-2"><div className="icon-tile icon-tile-sage"><Swords size={14} /></div><div><h3 className="text-xs font-semibold text-parchment">Character Reference</h3><p className="mt-0.5 text-[9px] uppercase tracking-[.12em] text-white/35">Quick stats &amp; dice</p></div></div>
        {collapsed ? <ChevronDown size={15} className="text-white/40" /> : <ChevronUp size={15} className="text-white/40" />}
      </button>
      {!collapsed && <div className="p-3.5">
        <div className="flex items-start justify-between"><div><div className="font-display text-lg text-parchment">{character.name}</div><div className="mt-0.5 text-[10px] text-white/40">Level {character.level} · {character.className}</div></div><div className="rounded-lg border border-white/[.08] bg-white/[.03] px-2.5 py-1.5 text-center"><div className="text-[9px] uppercase text-white/35">AC</div><div className="font-display text-xl text-brass-300">{character.ac}</div></div></div>
        <div className="mt-3 rounded-lg border border-white/[.06] bg-black/20 p-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="flex items-center gap-1.5 text-white/55"><Heart size={11} className="text-rose-300" /> Hit points</span><span className="font-medium tabular-nums text-parchment">{character.hp}<span className="text-white/35"> / {character.maxHp}</span></span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-rose-700 to-rose-400" style={{ width: `${Math.max(0,Math.min(100,character.hp / Math.max(1,character.maxHp) * 100))}%` }} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><Shield size={12} className="mx-auto mb-1 text-brass-300" /><div className="text-[9px] text-white/35">Initiative</div><div className="text-xs text-parchment">{modText(character.initiative)}</div></div>
            <div><Wind size={12} className="mx-auto mb-1 text-sage" /><div className="text-[9px] text-white/35">Speed</div><div className="text-xs text-parchment">{character.speed} ft</div></div>
            <div><Dices size={12} className="mx-auto mb-1 text-brass-300" /><div className="text-[9px] text-white/35">Proficiency</div><div className="text-xs text-parchment">{modText(character.proficiency)}</div></div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {scores.map(item => <div key={item.name} className="stat-score"><span>{item.name}</span><strong>{item.score}</strong><small>{modText(item.modifier)}</small></div>)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[['Perception',character.passivePerception],['Insight',character.passiveInsight],['Investigation',character.passiveInvestigation]].map(([label, value]) => <div key={label} className="rounded-md bg-white/[.025] px-2 py-2"><div className="text-[9px] text-white/35">Passive {label}</div><div className="mt-0.5 text-sm text-parchment">{value}</div></div>)}
        </div>
        <div className="mb-2 mt-4 flex items-center justify-between"><div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-white/45"><Sparkles size={11} className="text-brass-300" /> Ability cards</div><span className="text-[9px] text-white/25">Click to roll</span></div>
        <div className="space-y-1.5">
          {abilities.map(ability => <button key={ability.id} onClick={() => void roll(ability.id)} disabled={rolling !== null} className="ability-card group">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-[11px] font-medium text-parchment">{ability.name}</span><span className="rounded bg-white/[.05] px-1 py-0.5 text-[8px] uppercase tracking-wide text-white/35">{ability.kind}</span></div><div className="mt-1 truncate text-[9px] text-white/35">{ability.detail}</div></div>
            <div className="ml-2 flex shrink-0 items-center gap-2"><span className="font-mono text-[10px] text-brass-300">{ability.formula}</span><Dices size={13} className={`text-white/25 group-hover:text-brass-300 ${rolling === ability.id ? 'animate-pulse' : ''}`} /></div>
          </button>)}
        </div>
        <div className="mt-4 rounded-lg border border-white/[.07] bg-black/20 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-white/40"><Activity size={11} /> App roll log</div>
          {latest && <div className="mb-2 rounded-md border border-brass-400/20 bg-brass-500/[.08] p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-brass-300">{latest.abilityName}</span><strong className="font-display text-xl text-parchment">{latest.total}</strong></div><div className="mt-1 text-[9px] text-white/45">{latest.rolls.join(' + ')} {latest.modifier >= 0 ? `+ ${latest.modifier}` : `− ${Math.abs(latest.modifier)}`} · {latest.formula}</div></div>}
          <div className="space-y-1.5">
            {rolls.slice(0, 3).map(r => <div key={r.id} className="flex items-center justify-between gap-2 text-[10px]"><span className="truncate text-white/45">{r.abilityName}</span><span className="font-mono text-parchment">{r.total}</span></div>)}
            {!rolls.length && !latest && <div className="text-[10px] text-white/30">Your rolls will appear here.</div>}
          </div>
        </div>
      </div>}
    </section>
  )
}
