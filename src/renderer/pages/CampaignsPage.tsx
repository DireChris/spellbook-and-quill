import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { BookOpen, Check, Download, FileArchive, ImagePlus, LibraryBig, Pencil, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react'
import type { Campaign, CampaignBackup, CampaignInput } from '../../shared/types'

interface Props {
  campaigns: Campaign[]
  activeCampaignId: number
  onSwitch: (id: number) => Promise<void>
  onCreate: (input: CampaignInput) => Promise<void>
  onUpdate: (input: CampaignInput) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onExportBackup: (id: number) => Promise<CampaignBackup>
  onImportBackup: (backup: CampaignBackup) => Promise<void>
}
const blankCampaign = (): CampaignInput => ({ name: '', description: '', setting: '', ruleset: 'D&D 5e', imageData: '' })

async function imageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('That image could not be opened.')); image.src = objectUrl })
    const maxWidth = 1440
    const maxHeight = 900
    const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your system could not prepare the image.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const result = canvas.toDataURL('image/jpeg', 0.84)
    if (result.length > 5_800_000) throw new Error('That image is still too large after resizing. Try a smaller image.')
    return result
  } finally { URL.revokeObjectURL(objectUrl) }
}
function downloadFile(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function CampaignsPage({ campaigns, activeCampaignId, onSwitch, onCreate, onUpdate, onDelete, onExportBackup, onImportBackup }: Props) {
  const [draft, setDraft] = useState<CampaignInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const update = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => setDraft(previous => previous ? { ...previous, [key]: value } : previous)
  const startNew = () => { setDraft(blankCampaign()); setMessage(null) }
  const edit = (campaign: Campaign) => { setDraft({ id: campaign.id, name: campaign.name, description: campaign.description, setting: campaign.setting, ruleset: campaign.ruleset, imageData: campaign.imageData }); setMessage(null) }
  const save = async () => {
    if (!draft?.name.trim()) { setMessage({ text: 'Give the campaign a name first.', error: true }); return }
    setBusy(true)
    try {
      if (draft.id) await onUpdate(draft)
      else await onCreate(draft)
      setDraft(null); setMessage({ text: draft.id ? 'Campaign details saved.' : 'Campaign created and opened.' })
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Campaign could not be saved.', error: true }) }
    finally { setBusy(false) }
  }
  const pickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try { update('imageData', await imageToDataUrl(file)); setMessage({ text: 'Campaign artwork prepared. Save the campaign to keep it.' }) }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Could not load that image.', error: true }) }
    finally { event.target.value = '' }
  }
  const exportBackup = async (campaign: Campaign) => {
    setBusy(true)
    try {
      const backup = await onExportBackup(campaign.id)
      const slug = campaign.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'campaign'
      downloadFile(JSON.stringify(backup, null, 2), `${slug}.sqbackup`, 'application/json')
      setMessage({ text: `Backup exported for ${campaign.name}.` })
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Backup export failed.', error: true }) }
    finally { setBusy(false) }
  }
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text()) as CampaignBackup
      if (parsed.format !== 'spellbook-and-quill-campaign' || parsed.version !== 1) throw new Error('This file is not a supported Spellbook & Quill campaign backup.')
      await onImportBackup(parsed)
      setDraft(null); setMessage({ text: 'Campaign backup restored as a new campaign.' })
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Campaign backup could not be imported.', error: true }) }
    finally { setBusy(false); event.target.value = '' }
  }
  const deleteCampaign = async (campaign: Campaign) => {
    const message = campaigns.length <= 1
      ? 'You need at least one campaign. Create another campaign before deleting this one.'
      : `Delete “${campaign.name}”? The app will create a .sqbackup file in its local backups folder before removing this campaign. This action cannot be undone in the app.`
    if (campaigns.length <= 1) { setMessage({ text: message, error: true }); return }
    if (!window.confirm(message)) return
    setBusy(true)
    try { await onDelete(campaign.id); setMessage({ text: `“${campaign.name}” deleted after a local backup was created.` }) }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Campaign could not be deleted.', error: true }) }
    finally { setBusy(false) }
  }
  return (
    <div className="page-enter h-full min-h-0 overflow-y-auto px-5 py-6 md:px-8">
      <div className="mx-auto max-w-6xl pb-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><div className="section-eyebrow flex items-center gap-2"><LibraryBig size={12} /> Your campaign library</div><h1 className="mt-2 font-display text-3xl tracking-[-.035em] text-parchment">Campaigns</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">Every adventure has its own notes, quests, people, characters and treasure. Your last-used campaign opens automatically next time.</p></div>
          <div className="flex flex-wrap gap-2">
            <input ref={backupInput} type="file" accept=".sqbackup,.json,application/json" className="hidden" onChange={event => void importBackup(event)} />
            <button className="secondary-button" disabled={busy} onClick={() => backupInput.current?.click()}><Upload size={13} /> Restore backup</button>
            <button className="primary-button" onClick={startNew}><Plus size={14} /> New campaign</button>
          </div>
        </div>
        {message && <div className={`mb-5 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-xs ${message.error ? 'border-rose-400/20 bg-rose-400/[.06] text-rose-200' : 'border-sage/20 bg-sage/[.06] text-sage'}`} role="status"><ShieldAlert size={14} className="mt-0.5 shrink-0"/><span>{message.text}</span></div>}

        {draft && <section className="panel-card mb-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-white/[.06] px-5 py-4"><div><div className="section-eyebrow">Campaign details</div><h2 className="mt-1 font-display text-lg text-parchment">{draft.id ? 'Edit campaign' : 'Create campaign'}</h2></div><button className="icon-button" onClick={() => setDraft(null)} aria-label="Close campaign form"><X size={14}/></button></div>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <label className="block"><span className="field-label mb-1.5 block">Campaign name *</span><input autoFocus className="field-input" value={draft.name} onChange={event => update('name', event.target.value)} placeholder="Curse of Strahd" maxLength={120}/></label>
              <label className="block"><span className="field-label mb-1.5 block">Ruleset</span><select className="field-input" value={draft.ruleset} onChange={event => update('ruleset', event.target.value)}><option>D&amp;D 5e</option><option>D&amp;D 2024</option><option>Pathfinder 2e</option><option>Starfinder 2e</option><option>Other / homebrew</option></select></label>
              <label className="block sm:col-span-2"><span className="field-label mb-1.5 block">Setting / world</span><input className="field-input" value={draft.setting} onChange={event => update('setting', event.target.value)} placeholder="Ravenloft, Forgotten Realms, homebrew…" maxLength={180}/></label>
              <label className="block sm:col-span-2"><span className="field-label mb-1.5 block">Campaign description</span><textarea className="field-input resize-y" rows={4} value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Premise, tone, party goals and anything useful to remember…" maxLength={4000}/></label>
            </div>
            <div className="space-y-3">
              <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={event => void pickImage(event)} />
              <div className="campaign-art-preview" style={draft.imageData ? { backgroundImage: `linear-gradient(0deg,rgba(9,10,14,.25),rgba(9,10,14,.08)),url("${draft.imageData}")` } : undefined}>
                {!draft.imageData && <div className="text-center"><ImagePlus size={24} className="mx-auto text-brass-300/70"/><p className="mt-2 text-[10px] text-white/35">Optional campaign artwork</p></div>}
                {draft.imageData && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-white/70">Artwork preview</span>}
              </div>
              <button className="secondary-button w-full justify-center" onClick={() => imageInput.current?.click()}><ImagePlus size={13}/>{draft.imageData ? 'Change artwork' : 'Add image'}</button>
              {draft.imageData && <button className="text-[10px] text-white/35 hover:text-rose-300" onClick={() => update('imageData','')}>Remove artwork</button>}
              <p className="text-[9px] leading-4 text-white/25">Images are resized and stored locally in the campaign database. Nothing is uploaded to a server.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-white/[.06] px-5 py-4"><button className="secondary-button" onClick={() => setDraft(null)}>Cancel</button><button className="primary-button" disabled={busy||!draft.name.trim()} onClick={() => void save()}>{busy ? 'Saving…' : <><Check size={13}/> {draft.id ? 'Save details' : 'Create & open campaign'}</>}</button></div>
        </section>}

        <div className="mb-3 flex items-center justify-between"><div className="section-eyebrow">Your adventures <span className="ml-1 text-white/25">{campaigns.length}</span></div><div className="text-[10px] text-white/25">Stored on this device</div></div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {campaigns.map(campaign => <article key={campaign.id} className={`campaign-card overflow-hidden ${campaign.id === activeCampaignId ? 'campaign-card-active' : ''}`}>
            <div className="campaign-card-art" style={campaign.imageData ? { backgroundImage: `linear-gradient(0deg,rgba(8,9,12,.82),rgba(8,9,12,.12)),url("${campaign.imageData}")` } : undefined}>
              {!campaign.imageData && <div className="campaign-card-placeholder"><BookOpen size={29}/></div>}
              {campaign.id === activeCampaignId && <div className="absolute left-3 top-3 rounded-full border border-brass-300/25 bg-black/45 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.15em] text-brass-200">Currently open</div>}
              <div className="absolute bottom-3 left-4 right-4"><h3 className="font-display text-xl text-parchment">{campaign.name}</h3><p className="mt-1 text-[10px] text-white/60">{campaign.setting || campaign.ruleset}</p></div>
            </div>
            <div className="p-4"><p className="line-clamp-3 min-h-[48px] text-[11px] leading-5 text-white/40">{campaign.description || 'No campaign description yet.'}</p><div className="mt-2 flex items-center gap-1.5 text-[9px] text-white/25"><BookOpen size={11}/>{campaign.ruleset}<span className="text-white/15">·</span>Last opened {campaign.lastOpenedAt ? new Date(campaign.lastOpenedAt).toLocaleDateString() : 'recently'}</div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.06] pt-3">
                <button className="primary-button flex-1 justify-center" onClick={() => void onSwitch(campaign.id)}>{campaign.id === activeCampaignId ? <><Check size={12}/> Open campaign</> : <><BookOpen size={12}/> Switch to campaign</>}</button>
                <button className="icon-button" title="Edit campaign" onClick={() => edit(campaign)}><Pencil size={13}/></button>
                <button className="icon-button" title="Export campaign backup" disabled={busy} onClick={() => void exportBackup(campaign)}><Download size={13}/></button>
                <button className="icon-button" title="Delete campaign" disabled={busy||campaigns.length<=1} onClick={() => void deleteCampaign(campaign)}><Trash2 size={13}/></button>
              </div>
              {campaigns.length<=1 && <p className="mt-2 text-[9px] text-white/20">Create another campaign before deleting the only one.</p>}
            </div>
          </article>)}
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/[.06] bg-white/[.02] p-4"><FileArchive size={17} className="mt-0.5 shrink-0 text-brass-300/70"/><div><h3 className="text-xs font-medium text-parchment">Backups and campaign safety</h3><p className="mt-1 text-[10px] leading-5 text-white/35">Export a .sqbackup before major changes. Deleting a campaign automatically creates a local backup before removing its records. Restoring a backup adds a separate campaign and leaves existing campaigns untouched.</p></div></div>
      </div>
    </div>
  )
}
