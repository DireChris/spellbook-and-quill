import { Coins, Gem, ArrowUpRight } from 'lucide-react'
import type { Currency } from '../../shared/types'

interface Props { currency: Currency; itemCount: number; onOpen: () => void }
export function VaultPeek({ currency, itemCount, onOpen }: Props) {
  return (
    <section className="panel-card shrink-0 overflow-hidden">
      <button onClick={onOpen} className="flex w-full items-center justify-between border-b border-white/[.06] px-4 py-3 text-left transition hover:bg-white/[.02]">
        <div className="flex items-center gap-2"><div className="icon-tile icon-tile-amber"><Coins size={14}/></div><div><h3 className="text-xs font-semibold text-parchment">Party vault</h3><p className="mt-0.5 text-[9px] uppercase tracking-[.12em] text-white/35">Shared ledger</p></div></div><ArrowUpRight size={13} className="text-white/30"/>
      </button>
      <div className="grid grid-cols-4 gap-1.5 p-3">{([['PP',currency.pp,'coin-platinum'],['GP',currency.gp,'coin-gold'],['SP',currency.sp,'coin-silver'],['CP',currency.cp,'coin-copper']] as const).map(([label,value,cls])=><div key={label} className="rounded-md border border-white/[.05] bg-black/15 py-2 text-center"><div className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full border text-[7px] font-bold ${cls}`}>{label}</div><div className="font-display text-sm text-parchment">{value}</div><div className="mt-0.5 text-[8px] uppercase tracking-[.1em] text-white/25">{label}</div></div>)}</div>
      <button onClick={onOpen} className="flex w-full items-center justify-between border-t border-white/[.05] px-4 py-2.5 text-[10px] text-white/40 transition hover:bg-white/[.02] hover:text-brass-300"><span className="flex items-center gap-1.5"><Gem size={11} className="text-brass-300/75"/>{itemCount} loot item{itemCount===1?'':'s'} recorded</span><span>Open ledger →</span></button>
    </section>
  )
}
