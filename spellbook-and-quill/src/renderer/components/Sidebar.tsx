import { BookMarked, BookOpenText, ChevronsUpDown, Compass, Gem, LibraryBig, ScrollText, Search, Shield, Sparkles, Users, UserRound, WandSparkles } from 'lucide-react'
import type { Campaign } from '../../shared/types'
export type PageKey = 'dashboard' | 'notes' | 'quests' | 'vault' | 'npcs' | 'character' | 'campaigns' | 'search'
interface SidebarProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
  counts: { notes: number; quests: number; npcs: number; loot: number }
  campaigns: Campaign[]
  activeCampaignId: number
  onSwitchCampaign: (id: number) => void
}
const items: Array<{ id: PageKey; label: string; icon: typeof Compass; description: string }> = [
  { id: 'dashboard', label: 'Overview', icon: Compass, description: 'Camp overview' },
  { id: 'notes', label: 'Session notes', icon: ScrollText, description: 'Journal & lore' },
  { id: 'quests', label: 'Quest log', icon: BookOpenText, description: 'Objectives & leads' },
  { id: 'vault', label: 'Party vault', icon: Gem, description: 'Coin & treasure' },
  { id: 'npcs', label: 'NPC directory', icon: Users, description: 'People & factions' },
  { id: 'character', label: 'Character sheets', icon: UserRound, description: 'Stats, abilities & import' },
  { id: 'search', label: 'Search', icon: Search, description: 'Find clues & connections' },
]
export function Sidebar({ page, onNavigate, counts, campaigns, activeCampaignId, onSwitchCampaign }: SidebarProps) {
  const activeCampaign=campaigns.find(campaign=>campaign.id===activeCampaignId)
  return (
    <aside className="sidebar-shell flex h-full w-[236px] shrink-0 flex-col border-r border-white/[.06]">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="brand-mark"><WandSparkles size={22} strokeWidth={1.5} /></div>
        <div><div className="font-display text-[16px] tracking-[-.03em] text-parchment">Spellbook <span className="text-brass-400">&amp;</span></div><div className="font-display text-[16px] leading-4 tracking-[-.03em] text-parchment">Quill</div><div className="mt-1.5 text-[8px] font-medium uppercase tracking-[.22em] text-white/30">Campaign companion</div></div>
      </div>
      <div className="px-3 pb-4">
        <div className="section-eyebrow mb-2 px-2">Active campaign</div>
        <div className="campaign-switcher">
          <div className="campaign-switcher-art">
            {activeCampaign?.imageData && <img src={activeCampaign.imageData} alt="" className="campaign-switcher-image" />}
            {!activeCampaign?.imageData && <LibraryBig size={18} className="text-brass-300/65"/>}
          </div>
          <div className="min-w-0 flex-1">
            <select aria-label="Switch active campaign" className="campaign-switcher-select" value={activeCampaignId} onChange={event=>onSwitchCampaign(Number(event.target.value))}>
              {campaigns.map(campaign=><option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
            <div className="mt-1 truncate text-[9px] text-white/30">{activeCampaign?.setting || activeCampaign?.ruleset || 'Campaign workspace'}</div>
          </div>
          <ChevronsUpDown size={13} className="shrink-0 text-white/30"/>
        </div>
        <button className={`campaign-manage-link ${page==='campaigns'?'campaign-manage-link-active':''}`} onClick={()=>onNavigate('campaigns')}><LibraryBig size={13}/><span>Manage campaigns</span></button>
      </div>
      <div className="px-4"><div className="section-eyebrow mb-2 px-2">Campaign desk</div>
        <nav className="space-y-1">
          {items.map(item => {
            const Icon = item.icon
            const count = item.id === 'notes' ? counts.notes : item.id === 'quests' ? counts.quests : item.id === 'npcs' ? counts.npcs : item.id === 'vault' ? counts.loot : null
            return <button key={item.id} onClick={() => onNavigate(item.id)} className={`nav-item ${page === item.id ? 'nav-item-active' : ''}`}>
              <Icon size={16} strokeWidth={1.7} /><span className="min-w-0 flex-1 text-left"><span className="block text-[12px]">{item.label}</span><span className={`mt-0.5 block text-[9px] ${page === item.id ? 'text-brass-300/65' : 'text-white/25'}`}>{item.description}</span></span>{count !== null && <span className={`nav-count ${page === item.id ? 'nav-count-active' : ''}`}>{count}</span>}
            </button>
          })}
        </nav>
      </div>
      <div className="mt-auto px-5 pb-5">
        <div className="mb-4 h-px bg-white/[.06]" />
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full border border-brass-400/20 bg-brass-500/10 text-brass-300"><Shield size={15} /></div><div className="min-w-0"><div className="text-[11px] font-medium text-parchment">Local campaign data</div><div className="mt-1 flex items-center gap-1 text-[9px] text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-sage" />Stored on this device</div></div></div>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-white/20"><BookMarked size={10} /> <span>Keep a little magic close.</span> <Sparkles size={10} /></div>
      </div>
    </aside>
  )
}
