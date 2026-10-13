import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Coins, Gem, Minus, PackagePlus, Pencil, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import type { Currency, LootInput, LootItem } from '../../shared/types'

interface Props {
  currency: Currency
  loot: LootItem[]
  onCurrencySave: (currency: Currency) => Promise<void>
  onSaveLoot: (input: LootInput) => Promise<void>
  onDeleteLoot: (id: number) => Promise<void>
  onTagClick: (tag: string) => void
}
const zero: LootInput = { name: '', kind: 'Item', quantity: 1, description: '', valueGp: 0 }

export function VaultPage({ currency, loot, onCurrencySave, onSaveLoot, onDeleteLoot, onTagClick }: Props) {
  const [coins, setCoins] = useState(currency)
  const [item, setItem] = useState<LootInput>(zero)
  const [showForm, setShowForm] = useState(false)
  const [expandedLootId, setExpandedLootId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLElement>(null)
  useEffect(() => setCoins(currency), [currency])
  const updateCoin = (key: keyof Currency, value: number) => setCoins(prev => ({ ...prev, [key]: Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)) }))
  const saveCoins = async () => { await onCurrencySave(coins) }
  const editItem = (lootItem: LootItem) => {
    setItem({ id: lootItem.id, name: lootItem.name, kind: lootItem.kind, quantity: lootItem.quantity, description: lootItem.description, valueGp: lootItem.valueGp })
    setShowForm(true)
    setExpandedLootId(lootItem.id)
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
  }
  const resetForm = () => { setItem(zero); setShowForm(false) }
  const saveItem = async () => {
    if (!item.name.trim()) return
    setBusy(true)
    try {
      await onSaveLoot({ ...item, name: item.name.trim() })
      setExpandedLootId(item.id ?? null)
      resetForm()
    } finally { setBusy(false) }
  }
  const removeItem = async (lootItem: LootItem) => {
    if (!window.confirm(`Remove “${lootItem.name}” from the party vault?`)) return
    await onDeleteLoot(lootItem.id)
    if (expandedLootId === lootItem.id) setExpandedLootId(null)
    if (item.id === lootItem.id) resetForm()
  }
  const total = coins.pp * 10 + coins.gp + coins.sp / 10 + coins.cp / 100

  return (
    <div className="page-enter h-full min-h-0 overflow-y-auto p-6 xl:p-8">
      <div className="mx-auto max-w-6xl pb-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-brass-300"><Gem size={12}/> Shared treasure &amp; spoils</div><h1 className="font-display text-2xl tracking-[-.03em] text-parchment">Party vault</h1><p className="mt-1.5 text-[11px] text-white/40">Every coin counted, every strange relic accounted for.</p></div><button onClick={() => { if (showForm) resetForm(); else { setItem(zero); setShowForm(true) } }} className="primary-button shrink-0"><PackagePlus size={14}/>{showForm ? 'Close form' : 'Add loot'}</button></div>
        <div className="vault-hero panel-card relative overflow-hidden p-5 md:p-6"><div className="vault-glint"/><div className="relative z-10 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-brass-300"><Coins size={13}/> Estimated party wealth</div><div className="mt-2 font-display text-4xl tracking-[-.035em] text-parchment">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}<span className="ml-2 text-base text-white/35">gp equivalent</span></div><p className="mt-2 text-[10px] text-white/40">Converted for reference: 1 pp = 10 gp · 1 gp = 10 sp · 1 sp = 10 cp</p></div><div className="flex items-center gap-1.5 rounded-full border border-sage/20 bg-sage/[.07] px-3 py-1.5 text-[10px] text-sage"><ShieldCheck size={12}/> Stored locally</div></div></div>

        <section className="mt-5"><div className="mb-3 flex items-center justify-between"><div><div className="section-eyebrow">Purse contents</div><h2 className="mt-1 font-display text-lg text-parchment">Currency ledger</h2></div><button onClick={() => void saveCoins()} className="secondary-button"><Save size={12}/> Save currency</button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([['pp', 'Platinum pieces', 'PP', 'coin-platinum'], ['gp', 'Gold pieces', 'GP', 'coin-gold'], ['sp', 'Silver pieces', 'SP', 'coin-silver'], ['cp', 'Copper pieces', 'CP', 'coin-copper']] as const).map(([key, label, short, cls]) => <div key={key} className="panel-card currency-card p-4"><div className="flex items-center gap-2.5"><div className={`coin-disc ${cls}`}>{short}</div><div><div className="text-[11px] font-medium text-parchment">{label}</div><div className="text-[9px] text-white/30">Shared party purse</div></div></div><div className="mt-4 flex items-center justify-between gap-2"><button onClick={() => updateCoin(key, coins[key] - 1)} title={`Remove one ${label}`} className="coin-adjust"><Minus size={12}/></button><input type="number" min="0" value={coins[key]} onChange={e => updateCoin(key, Number(e.target.value))} onBlur={() => void saveCoins()} className="coin-value" aria-label={label}/><button onClick={() => updateCoin(key, coins[key] + 1)} title={`Add one ${label}`} className="coin-adjust"><Plus size={12}/></button></div></div>)}</div>
        </section>

        {showForm && <section ref={formRef} className="panel-card mt-5 p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="icon-tile icon-tile-amber"><PackagePlus size={14}/></div><div><h2 className="font-display text-lg text-parchment">{item.id ? 'Edit loot details' : 'Record new treasure'}</h2><p className="text-[10px] text-white/35">Full description, properties and value are saved with the item.</p></div></div><button type="button" className="icon-button" aria-label="Close loot editor" onClick={resetForm}><X size={14}/></button></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><VaultField label="Item name"><input autoFocus value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} placeholder="Moon-silver signet" className="field-input"/></VaultField><VaultField label="Item type"><select value={item.kind} onChange={e => setItem({ ...item, kind: e.target.value as LootInput['kind'] })} className="field-input">{['Item', 'Magic Item', 'Weapon', 'Armour', 'Other'].map(v => <option key={v}>{v}</option>)}</select></VaultField><VaultField label="Quantity"><input type="number" min="1" value={item.quantity} onChange={e => setItem({ ...item, quantity: Math.max(1, Number(e.target.value)) })} className="field-input"/></VaultField><VaultField label="Value (gp each)"><input type="number" min="0" step="0.1" value={item.valueGp} onChange={e => setItem({ ...item, valueGp: Math.max(0, Number(e.target.value)) })} className="field-input"/></VaultField><div className="md:col-span-2 xl:col-span-4"><VaultField label="Description &amp; properties"><textarea rows={6} value={item.description} onChange={e => setItem({ ...item, description: e.target.value })} placeholder="Full item description, appearance, magical effects, properties, attunement requirements, lore…" className="field-input min-h-[140px] resize-y"/></VaultField></div></div>
          <div className="mt-4 flex justify-end gap-2"><button onClick={resetForm} className="secondary-button">Cancel</button><button disabled={busy || !item.name.trim()} onClick={() => void saveItem()} className="primary-button disabled:opacity-40"><Save size={13}/>{busy ? 'Saving…' : item.id ? 'Save changes' : 'Add to vault'}</button></div>
        </section>}

        <section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><div className="section-eyebrow">Inventory register</div><h2 className="mt-1 font-display text-lg text-parchment">Loot &amp; artefacts <span className="ml-1 text-sm text-white/30">({loot.length})</span></h2></div><div className="text-[10px] text-white/30">Select an item to expand its full record</div></div>
          {loot.length ? <div className="overflow-hidden rounded-xl border border-white/[.07] bg-[#11141b]/70"><div className="vault-table-head hidden grid-cols-[minmax(0,1.8fr)_120px_80px_100px_76px] items-center gap-3 border-b border-white/[.06] px-4 py-3 md:grid"><span>Item</span><span>Type</span><span>Qty</span><span>Value</span><span>Actions</span></div>{loot.map(lootItem => {
            const expanded = expandedLootId === lootItem.id
            return <article key={lootItem.id} className="vault-item-row border-b border-white/[.04] last:border-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.8fr)_120px_80px_100px_76px]">
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedLootId(expanded ? null : lootItem.id)} className="flex min-w-0 items-center gap-3 text-left">
                  <div className={`loot-icon ${lootItem.kind === 'Magic Item' ? 'loot-icon-magic' : ''}`}><Gem size={15}/></div>
                  <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-medium text-parchment">{lootItem.name}</span>{expanded ? <ChevronDown size={13} className="shrink-0 text-brass-300"/> : <ChevronRight size={13} className="shrink-0 text-white/30"/>}</div><p className="mt-1 line-clamp-1 break-words text-left text-[10px] text-white/35">{lootItem.description || 'No description recorded.'}</p><div className="mt-1 flex flex-wrap gap-1">{lootItem.tags.map(tag => <span key={tag} role="button" tabIndex={0} onClick={event => { event.stopPropagation(); onTagClick(tag) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onTagClick(tag) } }} className="cursor-pointer text-[8px] text-brass-300/70 hover:text-brass-200">[{tag}]</span>)}</div></div>
                </button>
                <span className="hidden text-[10px] text-white/50 md:inline">{lootItem.kind}</span><span className="hidden text-[11px] tabular-nums text-parchment md:inline">{lootItem.quantity}</span><span className="hidden text-[11px] tabular-nums text-brass-300 md:inline">{lootItem.valueGp.toLocaleString()} gp</span>
                <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => editItem(lootItem)} title={`Edit ${lootItem.name}`} aria-label={`Edit ${lootItem.name}`} className="icon-button"><Pencil size={12}/></button><button type="button" onClick={() => void removeItem(lootItem)} title={`Remove ${lootItem.name}`} aria-label={`Remove ${lootItem.name}`} className="icon-button hover:!text-rose-300"><Trash2 size={13}/></button></div>
              </div>
              {expanded && <div className="border-t border-white/[.05] bg-black/15 px-5 py-4 md:pl-[68px]"><div className="mb-3 grid gap-3 sm:grid-cols-3"><Detail label="Type" value={lootItem.kind}/><Detail label="Quantity" value={String(lootItem.quantity)}/><Detail label="Value per item" value={`${lootItem.valueGp.toLocaleString()} gp`}/><Detail label="Total value" value={`${(lootItem.valueGp * lootItem.quantity).toLocaleString()} gp`}/></div><div><div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-white/35">Full description &amp; properties</div><p className="whitespace-pre-wrap break-words text-[11px] leading-6 text-white/65">{lootItem.description || 'No description recorded for this item yet.'}</p></div><div className="mt-4 flex justify-end"><button type="button" onClick={() => editItem(lootItem)} className="secondary-button"><Pencil size={12}/> Edit full details</button></div></div>}
            </article>
          })}</div> : <div className="panel-card px-5 py-12 text-center"><Gem size={22} className="mx-auto text-white/20"/><h3 className="mt-3 font-display text-lg text-parchment">The chest is empty</h3><p className="mt-1 text-xs text-white/35">Add the party’s first treasure to begin tracking spoils.</p><button onClick={() => { setItem(zero); setShowForm(true) }} className="secondary-button mt-4"><Plus size={12}/> Add loot</button></div>}
        </section>
      </div>
    </div>
  )
}
function VaultField({ label, children }: { label: string; children: ReactNode }) { return <div><label className="field-label mb-1.5 block">{label}</label>{children}</div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2.5"><div className="text-[9px] uppercase tracking-[.12em] text-white/30">{label}</div><div className="mt-1.5 break-words text-[11px] text-parchment">{value}</div></div> }
