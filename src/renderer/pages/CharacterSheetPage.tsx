import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Download, FileJson, Plus, Save, Shield, Sparkles, Trash2, Upload, UserRound, Users, UserPlus } from 'lucide-react'
import type { Ability, AbilityInput, CharacterStats, CharacterStatsInput } from '../../shared/types'

interface Props {
  character: CharacterStats
  characters: CharacterStats[]
  abilities: Ability[]
  onSave: (character: CharacterStatsInput, abilities: AbilityInput[]) => Promise<{ character: CharacterStats; abilities: Ability[] }>
  onCreateCharacter: () => Promise<void>
  onSelectCharacter: (id: number) => Promise<void>
  onDeleteCharacter: (id: number) => Promise<void>
}

type AnyRecord = Record<string, unknown>
const scoreKeys = [
  { key: 'str', label: 'Strength', ddbId: 1 },
  { key: 'dex', label: 'Dexterity', ddbId: 2 },
  { key: 'con', label: 'Constitution', ddbId: 3 },
  { key: 'int', label: 'Intelligence', ddbId: 4 },
  { key: 'wis', label: 'Wisdom', ddbId: 5 },
  { key: 'cha', label: 'Charisma', ddbId: 6 },
] as const

function fromCharacter(character: CharacterStats): CharacterStatsInput { return { ...character } }
function record(value: unknown): AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function first(...values: unknown[]): unknown { return values.find(value => value !== undefined && value !== null && value !== '') }
function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return fallback
}
function textValue(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : '' }
function keyName(value: unknown): string { return textValue(value).toLowerCase().replace(/[^a-z0-9]/g, '') }

/**
 * Best-effort mapper for Spellbook JSON, Roll20-style attribute arrays/objects,
 * and common D&D Beyond character JSON shapes. The importer never logs in to or
 * scrapes either service; it only parses a file the user explicitly selects.
 */
function parseCharacterImport(raw: unknown, current: CharacterStatsInput): { character: CharacterStatsInput; abilities: AbilityInput[] | null; source: string } {
  const root = record(raw)
  const character = record(first(root.character, root.data, root))
  const rawAttributes = first(character.attributes, character.attribs, root.attributes, root.attribs)
  const attributeMap: Record<string, unknown> = {}
  if (Array.isArray(rawAttributes)) {
    for (const item of rawAttributes) {
      const attr = record(item)
      const name = keyName(attr.name)
      if (name) attributeMap[name] = first(attr.current, attr.value, attr.max)
    }
  } else {
    for (const [key, value] of Object.entries(record(rawAttributes))) attributeMap[keyName(key)] = value
  }
  const stats = list(first(character.stats, root.stats))
  const bonuses = list(first(character.bonusStats, root.bonusStats))
  const overrides = list(first(character.overrideStats, root.overrideStats))
  const statMap = new Map<number, number>()
  const bonusMap = new Map<number, number>()
  const overrideMap = new Map<number, number>()
  for (const item of stats) {
    const stat = record(item); const id = numberValue(stat.id, 0)
    if (id >= 1 && id <= 6) statMap.set(id, numberValue(first(stat.value, stat.score), 10))
  }
  for (const item of bonuses) {
    const stat = record(item); const id = numberValue(stat.id, 0)
    if (id >= 1 && id <= 6) bonusMap.set(id, numberValue(first(stat.value, stat.score), 0))
  }
  for (const item of overrides) {
    const stat = record(item); const id = numberValue(stat.id, 0)
    if (id >= 1 && id <= 6 && first(stat.value, stat.score) !== undefined) overrideMap.set(id, numberValue(first(stat.value, stat.score), 0))
  }
  const readNumber = (names: string[], fallback: number, ddbId?: number) => {
    const direct = first(...names.flatMap(name => [character[name], root[name], attributeMap[keyName(name)]]))
    if (direct !== undefined) return numberValue(direct, fallback)
    if (ddbId !== undefined && statMap.has(ddbId)) {
      const override = overrideMap.get(ddbId)
      return override !== undefined && override > 0 ? override : (statMap.get(ddbId) ?? fallback) + (bonusMap.get(ddbId) ?? 0)
    }
    return fallback
  }
  const classes = list(first(character.classes, root.classes)).map(item => {
    const cls = record(item); const definition = record(cls.definition)
    return textValue(first(definition.name, cls.name, cls.className))
  }).filter(Boolean)
  const levelFromClasses = list(first(character.classes, root.classes)).reduce<number>((sum, item) => {
    const cls = record(item); return sum + numberValue(first(cls.level, record(cls.definition).level), 0)
  }, 0)
  const rawSpeed = first(character.speed, root.speed, attributeMap.speed)
  const speedObject = record(rawSpeed)
  const speed = typeof rawSpeed === 'object' ? first(speedObject.walk, speedObject.baseWalk, speedObject.walking, speedObject.value) : rawSpeed
  const hitPoints = record(first(character.hitPoints, root.hitPoints))
  const name = textValue(first(character.name, character.character_name, root.name, attributeMap.charactername, attributeMap.character_name, current.name))
  const className = textValue(first(character.className, character.class_name, character.class, root.className, root.class_name, classes.join(' / '), attributeMap.class, current.className))
  const imported: CharacterStatsInput = {
    ...current,
    name: name || current.name,
    species: textValue(first(character.species, character.race, root.species, root.race, current.species)),
    background: textValue(first(character.background, root.background, current.background)),
    alignment: textValue(first(character.alignment, root.alignment, current.alignment)),
    backstory: textValue(first(character.backstory, character.biography, root.backstory, root.biography, current.backstory)),
    personalityTraits: textValue(first(character.personalityTraits, character.personality_traits, current.personalityTraits)),
    ideals: textValue(first(character.ideals, current.ideals)),
    bonds: textValue(first(character.bonds, current.bonds)),
    flaws: textValue(first(character.flaws, current.flaws)),
    experience: readNumber(['experience', 'xp', 'experiencePoints'], current.experience),
    className: className || current.className,
    level: readNumber(['level', 'character_level', 'totalLevel'], levelFromClasses || current.level),
    hp: readNumber(['hp', 'currentHp', 'current_hp', 'hitPointsCurrent'], numberValue(first(hitPoints.current, hitPoints.value), current.hp)),
    maxHp: readNumber(['maxHp', 'max_hp', 'hp_max', 'hitPointsMax'], numberValue(first(hitPoints.maximum, hitPoints.max), current.maxHp)),
    ac: readNumber(['ac', 'armorClass', 'armor_class'], current.ac),
    initiative: readNumber(['initiative', 'initiativeBonus', 'initiative_bonus'], current.initiative),
    speed: numberValue(speed, current.speed),
    proficiency: readNumber(['proficiency', 'proficiencyBonus', 'proficiency_bonus', 'pb'], current.proficiency),
    passivePerception: readNumber(['passivePerception', 'passive_perception', 'passive_wisdom'], current.passivePerception),
    passiveInsight: readNumber(['passiveInsight', 'passive_insight'], current.passiveInsight),
    passiveInvestigation: readNumber(['passiveInvestigation', 'passive_investigation'], current.passiveInvestigation),
    str: readNumber(['str', 'strength'], current.str, 1),
    dex: readNumber(['dex', 'dexterity'], current.dex, 2),
    con: readNumber(['con', 'constitution'], current.con, 3),
    int: readNumber(['int', 'intelligence'], current.int, 4),
    wis: readNumber(['wis', 'wisdom'], current.wis, 5),
    cha: readNumber(['cha', 'charisma'], current.cha, 6),
  }
  const rawAbilities = first(root.abilities, character.abilities)
  let importedAbilities: AbilityInput[] | null = null
  if (Array.isArray(rawAbilities)) {
    const candidateAbilities = rawAbilities.map(value => {
      const item = record(value)
      const name = textValue(first(item.name, item.label, item.title)).trim()
      if (!name) return null
      const kindText = textValue(first(item.kind, item.type, item.category)).toLowerCase()
      const kind: AbilityInput['kind'] = kindText.includes('spell') ? 'Spell' : kindText.includes('attack') || kindText.includes('weapon') ? 'Attack' : 'Ability'
      let formula = textValue(first(item.formula, item.rollFormula, item.roll, item.attackFormula)).replace(/\s+/g, '').toLowerCase()
      if (!/^\d{1,2}d\d{1,3}(?:[+-]\d{1,4})?$/.test(formula)) {
        const attackBonus = first(item.attackBonus, item.attack_bonus)
        formula = attackBonus !== undefined ? `1d20${numberValue(attackBonus, 0) >= 0 ? '+' : ''}${numberValue(attackBonus, 0)}` : '1d20'
      }
      return { name, kind, detail: textValue(first(item.detail, item.description, item.desc)), formula, uses: textValue(first(item.uses, item.range, item.resource)) }
    }).filter((item): item is AbilityInput => item !== null)
    if (candidateAbilities.length) importedAbilities = candidateAbilities.slice(0, 200)
  }
  const format = textValue(root.format).toLowerCase()
  const source = format.includes('spellbook') ? 'Spellbook & Quill JSON' : Array.isArray(rawAttributes) || character.attribs !== undefined ? 'Roll20-style character data' : character.stats !== undefined || character.bonusStats !== undefined ? 'D&D Beyond-style character data' : 'Compatible character JSON'
  return { character: imported, abilities: importedAbilities, source }
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block min-w-0"><span className="field-label mb-1.5 block">{label}</span><input className="field-input" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>
}
function NumberField({ label, value, onChange, min = 0, max = 9999 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return <label className="block min-w-0"><span className="field-label mb-1.5 block">{label}</span><input className="field-input tabular-nums" type="number" min={min} max={max} value={value} onChange={event => onChange(numberValue(event.target.value, 0))} /></label>
}

export function CharacterSheetPage({ character, characters, abilities, onSave, onCreateCharacter, onSelectCharacter, onDeleteCharacter }: Props) {
  const [draft, setDraft] = useState<CharacterStatsInput>(() => fromCharacter(character))
  const [abilityDraft, setAbilityDraft] = useState<AbilityInput[]>(() => abilities.map(({ id, name, kind, detail, formula, uses }) => ({ id, name, kind, detail, formula, uses })))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(fromCharacter(character))
    setAbilityDraft(abilities.map(({ id, name, kind, detail, formula, uses }) => ({ id, name, kind, detail, formula, uses })))
    setMessage(null)
  }, [character.id])

  const update = <K extends keyof CharacterStatsInput>(key: K, value: CharacterStatsInput[K]) => setDraft(previous => ({ ...previous, [key]: value }))
  const updateAbility = (index: number, patch: Partial<AbilityInput>) => setAbilityDraft(previous => previous.map((ability, itemIndex) => itemIndex === index ? { ...ability, ...patch } : ability))

  const save = async () => {
    if (!draft.name.trim()) { setMessage({ text: 'Give your character a name before saving.', error: true }); return }
    const invalidAbility = abilityDraft.find(ability => !ability.name.trim() || !/^\d{1,2}d\d{1,3}(?:[+-]\d{1,4})?$/.test(ability.formula.replace(/\s+/g, '').toLowerCase()))
    if (invalidAbility) { setMessage({ text: `Check the name and dice formula for “${invalidAbility.name || 'unnamed ability'}”. Example: 1d20+5.`, error: true }); return }
    setBusy(true)
    try {
      const normalizedAbilities = abilityDraft.map(ability => ({ ...ability, formula: ability.formula.replace(/\s+/g, '').toLowerCase() }))
      const saved = await onSave(draft, normalizedAbilities)
      setDraft(fromCharacter(saved.character))
      setAbilityDraft(saved.abilities.map(({ id, name, kind, detail, formula, uses }) => ({ id, name, kind, detail, formula, uses })))
      setMessage({ text: 'Character sheet and ability cards saved locally.' })
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Could not save character sheet.', error: true })
    } finally { setBusy(false) }
  }

  const exportJson = () => {
    const payload = { format: 'spellbook-and-quill-character', version: 1, exportedAt: new Date().toISOString(), character: draft, abilities: abilityDraft.map(({ name, kind, detail, formula, uses }) => ({ name, kind, detail, formula, uses })) }
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = `${draft.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'character'}-spellbook.json`
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(blobUrl)
    setMessage({ text: 'Character JSON exported.' })
  }

  const importJson = async (file?: File) => {
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      const parsed = parseCharacterImport(raw, draft)
      setDraft(parsed.character)
      if (parsed.abilities) setAbilityDraft(parsed.abilities)
      setMessage({ text: `${parsed.source} imported into the form. Review the fields, then select Save changes.${parsed.abilities ? '' : ' No compatible ability-card array was found, so your existing cards were kept.'}` })
    } catch (error) {
      setMessage({ text: error instanceof Error ? `Could not import this JSON: ${error.message}` : 'Could not import this JSON file.', error: true })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 md:px-8">
      <div className="mx-auto max-w-5xl pb-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><div className="section-eyebrow">Campaign desk / field records</div><h1 className="mt-2 flex items-center gap-3 font-display text-3xl tracking-[-.035em] text-parchment"><UserRound size={25} className="text-brass-300" /> Character sheet</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">Edit core stats, passive scores and the quick-roll cards shown in your field kit. Changes stay in your local campaign database.</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-[180px] items-center gap-2 rounded-lg border border-white/[.08] bg-black/20 px-3 py-2"><Users size={13} className="shrink-0 text-brass-300"/><select aria-label="Select character in this campaign" className="min-w-0 flex-1 bg-transparent text-[11px] text-parchment outline-none" value={character.id} onChange={event => void onSelectCharacter(Number(event.target.value))}>{characters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button className="secondary-button" onClick={() => void onCreateCharacter()}><UserPlus size={13} /> New character</button>
            <button className="icon-button hover:!text-rose-300" disabled={characters.length<=1} title={characters.length<=1 ? 'A campaign must have at least one character' : 'Delete this character'} onClick={() => { if (window.confirm(`Delete ${character.name}? Their sheet and abilities will be removed from this campaign.`)) void onDeleteCharacter(character.id) }}><Trash2 size={13}/></button>
            <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={event => void importJson(event.target.files?.[0])} />
            <button className="secondary-button" onClick={() => fileInput.current?.click()}><Upload size={13} /> Import JSON</button>
            <button className="secondary-button" onClick={exportJson}><Download size={13} /> Export JSON</button>
            <button className="primary-button" disabled={busy} onClick={() => void save()}><Save size={13} /> {busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>

        {message && <div role="status" className={`mb-5 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-xs ${message.error ? 'border-rose-400/20 bg-rose-400/[.06] text-rose-200' : 'border-sage/20 bg-sage/[.06] text-sage'}`}>
          {message.error ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <Sparkles size={14} className="mt-0.5 shrink-0" />}<span>{message.text}</span>
        </div>}

        <section className="panel-card p-5 md:p-6">
          <div className="mb-5 flex items-center gap-2"><div className="icon-tile icon-tile-sage"><Shield size={14} /></div><div><h2 className="font-display text-lg text-parchment">Identity &amp; advancement</h2><p className="text-[10px] text-white/35">The basics displayed in Character Reference.</p></div></div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="Character name" value={draft.name} onChange={value => update('name', value)} placeholder="Character name" />
            <TextField label="Class / multiclass" value={draft.className} onChange={value => update('className', value)} placeholder="Fighter / Wizard" />
            <NumberField label="Level" value={draft.level} onChange={value => update('level', Math.max(1, Math.min(20, value)))} min={1} max={20} />
            <TextField label="Species / ancestry" value={draft.species} onChange={value => update('species', value)} placeholder="Human, Elf, Tiefling…" />
            <TextField label="Background" value={draft.background} onChange={value => update('background', value)} placeholder="Hermit, Soldier, Sage…" />
            <TextField label="Alignment" value={draft.alignment} onChange={value => update('alignment', value)} placeholder="Neutral Good" />
            <NumberField label="Experience points" value={draft.experience} onChange={value => update('experience', Math.max(0, value))} max={99999999} />
          </div>
        </section>

        <section className="panel-card mt-4 p-5 md:p-6">
          <div className="mb-5"><h2 className="font-display text-lg text-parchment">Backstory &amp; personality</h2><p className="text-[10px] text-white/35">Record the person behind the numbers: their history, motivations and ties.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2"><span className="field-label mb-1.5 block">Backstory</span><textarea rows={5} className="field-input resize-y" value={draft.backstory} onChange={event => update('backstory', event.target.value)} placeholder="Where they came from, what they want, and what they would rather keep hidden…" /></label>
            <label className="block"><span className="field-label mb-1.5 block">Personality traits</span><textarea rows={3} className="field-input resize-y" value={draft.personalityTraits} onChange={event => update('personalityTraits', event.target.value)} placeholder="How they behave around others…" /></label>
            <label className="block"><span className="field-label mb-1.5 block">Ideals</span><textarea rows={3} className="field-input resize-y" value={draft.ideals} onChange={event => update('ideals', event.target.value)} placeholder="What they believe in…" /></label>
            <label className="block"><span className="field-label mb-1.5 block">Bonds</span><textarea rows={3} className="field-input resize-y" value={draft.bonds} onChange={event => update('bonds', event.target.value)} placeholder="People, places and causes they care about…" /></label>
            <label className="block"><span className="field-label mb-1.5 block">Flaws</span><textarea rows={3} className="field-input resize-y" value={draft.flaws} onChange={event => update('flaws', event.target.value)} placeholder="Temptations, weaknesses, unfinished business…" /></label>
          </div>
        </section>

        <section className="panel-card mt-4 p-5 md:p-6">
          <div className="mb-5"><h2 className="font-display text-lg text-parchment">Combat &amp; senses</h2><p className="text-[10px] text-white/35">Current hit points, combat values and passive scores. These can be entered as displayed on your sheet.</p></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField label="Current HP" value={draft.hp} onChange={value => update('hp', value)} max={9999} />
            <NumberField label="Maximum HP" value={draft.maxHp} onChange={value => update('maxHp', Math.max(1, value))} min={1} max={9999} />
            <NumberField label="Armour Class" value={draft.ac} onChange={value => update('ac', value)} max={100} />
            <NumberField label="Initiative modifier" value={draft.initiative} onChange={value => update('initiative', value)} min={-50} max={100} />
            <NumberField label="Speed (ft)" value={draft.speed} onChange={value => update('speed', value)} max={1000} />
            <NumberField label="Proficiency bonus" value={draft.proficiency} onChange={value => update('proficiency', value)} min={-20} max={100} />
            <NumberField label="Passive Perception" value={draft.passivePerception} onChange={value => update('passivePerception', value)} max={100} />
            <NumberField label="Passive Insight" value={draft.passiveInsight} onChange={value => update('passiveInsight', value)} max={100} />
            <NumberField label="Passive Investigation" value={draft.passiveInvestigation} onChange={value => update('passiveInvestigation', value)} max={100} />
          </div>
        </section>

        <section className="panel-card mt-4 p-5 md:p-6">
          <div className="mb-5"><h2 className="font-display text-lg text-parchment">Ability scores</h2><p className="text-[10px] text-white/35">Modifiers in Character Reference are calculated from these values.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {scoreKeys.map(score => <NumberField key={score.key} label={score.label} value={draft[score.key]} onChange={value => update(score.key, Math.max(1, Math.min(40, value)))} min={1} max={40} />)}
          </div>
        </section>

        <section className="panel-card mt-4 p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg text-parchment">Ability &amp; spell cards</h2><p className="mt-1 text-[10px] text-white/35">These cards appear in your right-side field kit and use the dice formula shown.</p></div><button className="secondary-button" onClick={() => setAbilityDraft(previous => [...previous, { name: 'New ability', kind: 'Ability', detail: '', formula: '1d20', uses: '' }])}><Plus size={13} /> Add card</button></div>
          <div className="space-y-3">
            {abilityDraft.map((ability, index) => <div key={`${ability.id ?? 'new'}-${index}`} className="rounded-xl border border-white/[.07] bg-black/15 p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[9px] font-semibold uppercase tracking-[.16em] text-brass-300">Card {index + 1}</span><button className="icon-button hover:!text-rose-300" title={`Remove ${ability.name}`} onClick={() => setAbilityDraft(previous => previous.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={13} /></button></div>
              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-4"><TextField label="Name" value={ability.name} onChange={value => updateAbility(index, { name: value })} placeholder="Longsword" /></div>
                <label className="block min-w-0 md:col-span-2"><span className="field-label mb-1.5 block">Type</span><select className="field-input" value={ability.kind} onChange={event => updateAbility(index, { kind: event.target.value as AbilityInput['kind'] })}><option value="Attack">Attack</option><option value="Ability">Ability</option><option value="Spell">Spell</option></select></label>
                <div className="md:col-span-2"><TextField label="Roll formula" value={ability.formula} onChange={value => updateAbility(index, { formula: value })} placeholder="1d20+5" /></div>
                <div className="md:col-span-4"><TextField label="Range / uses" value={ability.uses} onChange={value => updateAbility(index, { uses: value })} placeholder="Melee · once per turn" /></div>
                <div className="md:col-span-12"><TextField label="Detail" value={ability.detail} onChange={value => updateAbility(index, { detail: value })} placeholder="Attack, effect, concentration, damage notes…" /></div>
              </div>
            </div>)}
            {!abilityDraft.length && <div className="rounded-lg border border-dashed border-white/10 px-5 py-8 text-center text-xs text-white/35">No ability cards configured. Add a card to make it available in the field kit.</div>}
          </div>
        </section>

        <section className="panel-card mt-4 p-5">
          <div className="flex items-start gap-3"><div className="icon-tile icon-tile-amber"><FileJson size={14} /></div><div><h2 className="font-display text-base text-parchment">Importing from Roll20 or D&amp;D Beyond</h2><p className="mt-1 max-w-3xl text-[11px] leading-5 text-white/45">Import accepts JSON files that contain character fields directly, Roll20-style <code className="text-brass-300">attributes</code>/<code className="text-brass-300">attribs</code> arrays, or D&amp;D Beyond-style <code className="text-brass-300">stats</code> arrays with ability IDs 1–6. Support depends on the file shape you can export; the app does not sign in to either service or bypass their access controls. Review imported values before saving.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2"><button className="secondary-button" onClick={exportJson}><Download size={12} /> Download JSON backup/template</button><span className="self-center text-[10px] text-white/25">Import fills the form only; it does not overwrite the database until you save.</span></div>
        </section>

        <div className="mt-5 flex justify-end"><button className="primary-button" disabled={busy} onClick={() => void save()}><Save size={13} /> {busy ? 'Saving…' : 'Save character sheet'}</button></div>
      </div>
    </div>
  )
}
