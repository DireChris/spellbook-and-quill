import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx'
import type { CampaignBackup } from '../shared/types'

const GOLD = '8C6A2C'
const DARK = '292722'
const MUTED = '66625B'
const PALE_GOLD = 'F4EEDF'
const LINE = 'DED8CB'

type ImageFormat = 'jpg' | 'png'
type ArchiveRecord = Record<string, any>

function text(value: unknown): string {
  return String(value ?? '').replace(/\u0000/g, '').trim()
}
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, number: string) => {
      const code = Number(number)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/&#x([\da-f]+);/gi, (_match, number: string) => {
      const code = Number.parseInt(number, 16)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
}
function plainText(value: unknown): string {
  return decodeEntities(text(value).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}
function dateLabel(value: unknown): string {
  const source = text(value)
  if (!source) return 'Not recorded'
  const date = new Date(source)
  return Number.isNaN(date.getTime()) ? source : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
function slug(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'campaign'
}
function paragraph(value: string, options: { italic?: boolean; color?: string; after?: number; before?: number; bold?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: value || ' ', font: 'Aptos', size: 21, color: options.color ?? DARK, italics: options.italic, bold: options.bold })],
    spacing: { before: options.before ?? 0, after: options.after ?? 100, line: 276 },
  })
}
function keyValue(label: string, value: unknown): Paragraph {
  const result = text(value) || '—'
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: GOLD, font: 'Aptos', size: 21 }),
      new TextRun({ text: result, color: DARK, font: 'Aptos', size: 21 }),
    ],
    spacing: { after: 80, line: 276 },
  })
}
function heading(value: string, level: 1 | 2 | 3 = 1, pageBreakBefore = false): Paragraph {
  const style = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3
  return new Paragraph({
    heading: style,
    pageBreakBefore,
    keepNext: true,
    border: level === 1 ? { bottom: { color: LINE, style: BorderStyle.SINGLE, size: 5, space: 5 } } : undefined,
    spacing: { before: level === 1 ? 360 : level === 2 ? 260 : 180, after: level === 1 ? 140 : 90 },
    children: [new TextRun({ text: value, font: 'Georgia', bold: true, size: level === 1 ? 32 : level === 2 ? 26 : 23, color: level === 1 ? GOLD : DARK })],
  })
}
function bullet(value: string, checked?: boolean): Paragraph {
  const prefix = checked === undefined ? '•  ' : checked ? '[X]  ' : '[ ]  '
  return new Paragraph({
    children: [new TextRun({ text: `${prefix}${value}`, font: 'Aptos', size: 20, color: DARK })],
    indent: { left: 220, hanging: 100 },
    spacing: { after: 65, line: 260 },
  })
}
function tagsLine(tags: unknown): Paragraph | null {
  if (!Array.isArray(tags) || tags.length === 0) return null
  return paragraph(`Tags: ${tags.map(text).filter(Boolean).map(tag => `#${tag}`).join(', ')}`, { italic: true, color: MUTED, after: 120 })
}

// Tiptap notes are stored as HTML. Preserve block boundaries, lists and callouts
// in a stable, text-first form so the export does not rely on an HTML renderer.
function richTextParagraphs(html: unknown): Paragraph[] {
  const source = String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, contents: string) => `\n@@QUOTE@@${contents.replace(/<\/?(p|div|br)\b[^>]*>/gi, ' ')}@@ENDQUOTE@@\n`)
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, tag: string, contents: string) => `\n@@${tag.toUpperCase()}@@${contents}@@END@@\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, contents: string) => `\n@@BULLET@@${contents.replace(/<\/?(p|div|br)\b[^>]*>/gi, ' ')}@@END@@\n`)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|pre|table|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  const decoded = decodeEntities(source).replace(/\r/g, '\n')
  const blocks = decoded.split(/\n+/).map(block => block.trim()).filter(Boolean)
  if (!blocks.length) return [paragraph('No content recorded.', { italic: true, color: MUTED })]

  return blocks.map(block => {
    const headingMatch = block.match(/^@@(H[1-6])@@([\s\S]*?)@@END@@$/)
    if (headingMatch) {
      const level = Math.min(3, Number(headingMatch[1].slice(1))) as 1 | 2 | 3
      return heading(headingMatch[2].trim(), level)
    }
    if (block.startsWith('@@QUOTE@@')) {
      const value = block.replace(/^@@QUOTE@@/, '').replace(/@@ENDQUOTE@@$/, '').trim()
      return new Paragraph({
        children: [new TextRun({ text: value || ' ', italics: true, font: 'Aptos', size: 21, color: DARK })],
        indent: { left: 360, right: 240 },
        shading: { type: ShadingType.CLEAR, fill: PALE_GOLD },
        border: { left: { color: GOLD, style: BorderStyle.SINGLE, size: 16, space: 8 } },
        spacing: { before: 100, after: 150, line: 280 },
      })
    }
    if (block.startsWith('@@BULLET@@')) {
      return bullet(block.replace(/^@@BULLET@@/, '').replace(/@@END@@$/, '').trim())
    }
    const clean = block.replace(/@@ENDQUOTE@@/g, '').replace(/@@END@@/g, '').trim()
    return paragraph(clean)
  })
}

function getImageDimensions(bytes: Buffer, type: ImageFormat): { width: number; height: number } | null {
  try {
    if (type === 'png' && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    if (type !== 'jpg' || bytes.length < 4) return null
    let offset = 2
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue }
      const marker = bytes[offset + 1]
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
      const length = bytes.readUInt16BE(offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) return null
      if (startOfFrame.has(marker)) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      offset += 2 + length
    }
  } catch { /* malformed image, omitted from the document */ }
  return null
}
function imageRunFromDataUri(value: unknown, maxWidth = 520, maxHeight = 310): ImageRun | null {
  const match = text(value).match(/^data:image\/(jpeg|jpg|png);base64,([\s\S]+)$/i)
  if (!match) return null
  try {
    const type: ImageFormat = match[1].toLowerCase() === 'png' ? 'png' : 'jpg'
    const bytes = Buffer.from(match[2], 'base64')
    const size = getImageDimensions(bytes, type)
    if (!size || size.width <= 0 || size.height <= 0 || bytes.length > 8_000_000) return null
    const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height)
    return new ImageRun({ data: bytes, type, transformation: { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) } })
  } catch { return null }
}

function addTagsAndEmptyFallback(children: Paragraph[], tags: unknown) {
  const line = tagsLine(tags)
  if (line) children.push(line)
}

export async function buildCampaignWordDocument(backup: CampaignBackup): Promise<Buffer> {
  const campaign = (backup.campaign ?? {}) as ArchiveRecord
  const content = (backup.content ?? {}) as ArchiveRecord
  const notes = (Array.isArray(content.notes) ? content.notes : []) as ArchiveRecord[]
  const quests = (Array.isArray(content.quests) ? content.quests : []) as ArchiveRecord[]
  const npcs = (Array.isArray(content.npcs) ? content.npcs : []) as ArchiveRecord[]
  const npcLogs = (Array.isArray(content.npcLogs) ? content.npcLogs : []) as ArchiveRecord[]
  const loot = (Array.isArray(content.loot) ? content.loot : []) as ArchiveRecord[]
  const characters = (Array.isArray(content.characters) ? content.characters : []) as ArchiveRecord[]
  const rolls = (Array.isArray(content.rolls) ? content.rolls : []) as ArchiveRecord[]
  const currency = (content.currency ?? {}) as ArchiveRecord
  const children: Paragraph[] = []

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 900, after: 180 },
    children: [new TextRun({ text: 'SPELLBOOK & QUILL', font: 'Georgia', bold: true, size: 22, color: GOLD, characterSpacing: 60 })],
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: text(campaign.name) || 'Untitled Campaign', font: 'Georgia', bold: true, size: 48, color: DARK })],
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: 'CAMPAIGN ARCHIVE', font: 'Aptos', bold: true, size: 20, color: GOLD, characterSpacing: 50 })],
  }))
  const settingLine = [text(campaign.setting), text(campaign.ruleset)].filter(Boolean).join('  •  ')
  if (settingLine) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 150 }, children: [new TextRun({ text: settingLine, font: 'Aptos', size: 22, color: MUTED })] }))
  const campaignImage = imageRunFromDataUri(campaign.imageData, 600, 280)
  if (campaignImage) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 180 }, children: [campaignImage] }))
  if (text(campaign.description)) children.push(paragraph(text(campaign.description), { color: MUTED, after: 260 }))
  children.push(paragraph(`Exported ${dateLabel(backup.exportedAt)} · Generated locally by Spellbook & Quill`, { italic: true, color: MUTED, after: 260 }))

  children.push(heading('Archive contents', 1))
  for (const entry of [
    `${notes.length} journal and lore entries`,
    `${quests.length} quests and their objectives`,
    `${npcs.length} NPC profiles and ${npcLogs.length} conversation-ledger entries`,
    `${loot.length} party-vault items`,
    `${characters.length} character sheets`,
    `${rolls.length} recorded ability rolls`,
    'Party currency, scratch pad, campaign notes and tags',
  ]) children.push(bullet(entry))
  children.push(paragraph('This Word file is a readable archive for reference or leaving the app. Use the separate .sqbackup export when you need a restorable Spellbook & Quill campaign backup.', { italic: true, color: MUTED, after: 240 }))

  children.push(heading('Campaign overview', 1, true))
  children.push(keyValue('Campaign', campaign.name))
  children.push(keyValue('Setting', campaign.setting))
  children.push(keyValue('Ruleset', campaign.ruleset))
  children.push(keyValue('Description', campaign.description))
  children.push(keyValue('Export date', dateLabel(backup.exportedAt)))
  children.push(keyValue('Coin purse', `PP ${Number(currency.pp ?? 0)} · GP ${Number(currency.gp ?? 0)} · SP ${Number(currency.sp ?? 0)} · CP ${Number(currency.cp ?? 0)}`))

  children.push(heading('Session journal & lore', 1))
  if (!notes.length) children.push(paragraph('No journal entries have been recorded.', { italic: true, color: MUTED }))
  for (const note of notes) {
    children.push(heading(text(note.title) || 'Untitled note', 2))
    children.push(keyValue('Type', text(note.kind) || 'session'))
    if (note.createdAt) children.push(keyValue('Created', dateLabel(note.createdAt)))
    if (note.updatedAt) children.push(keyValue('Last updated', dateLabel(note.updatedAt)))
    addTagsAndEmptyFallback(children, note.tags)
    children.push(...richTextParagraphs(note.content))
  }

  children.push(heading('Quests & objectives', 1))
  if (!quests.length) children.push(paragraph('No quests have been recorded.', { italic: true, color: MUTED }))
  for (const quest of quests) {
    children.push(heading(text(quest.name) || 'Untitled quest', 2))
    children.push(keyValue('Status', quest.status))
    children.push(keyValue('Giver / faction', quest.giver))
    children.push(keyValue('Rewards', quest.rewards))
    if (text(quest.notes)) { children.push(paragraph('Quest notes', { bold: true, color: GOLD, after: 50 })); children.push(...richTextParagraphs(quest.notes)) }
    const objectives = Array.isArray(quest.objectives) ? quest.objectives as ArchiveRecord[] : []
    if (objectives.length) {
      children.push(paragraph('Objectives', { bold: true, color: GOLD, before: 80, after: 60 }))
      for (const objective of objectives) children.push(bullet(`${objective.isSide ? 'Side quest' : 'Main objective'}: ${text(objective.title)}`, Boolean(objective.done)))
    }
    addTagsAndEmptyFallback(children, quest.tags)
  }

  children.push(heading('NPCs & factions', 1))
  if (!npcs.length) children.push(paragraph('No NPC profiles have been recorded.', { italic: true, color: MUTED }))
  for (const npc of npcs) {
    children.push(heading(text(npc.name) || 'Unnamed NPC', 2))
    const portrait = imageRunFromDataUri(npc.imageData, 260, 300)
    if (portrait) children.push(new Paragraph({ spacing: { after: 100 }, children: [portrait] }))
    else if (text(npc.imageData).startsWith('data:image/webp')) children.push(paragraph('[Portrait saved in the app as WebP; not embedded in this Word export.]', { italic: true, color: MUTED }))
    children.push(keyValue('Faction / allegiance', npc.faction))
    children.push(keyValue('Location', npc.location))
    children.push(keyValue('Standing', npc.standing))
    if (text(npc.notes)) { children.push(paragraph('Field notes', { bold: true, color: GOLD, before: 70, after: 50 })); children.push(...richTextParagraphs(npc.notes)) }
    addTagsAndEmptyFallback(children, npc.tags)
  }

  children.push(heading('Conversation ledger', 1))
  if (!npcLogs.length) children.push(paragraph('No conversation or encounter logs have been recorded.', { italic: true, color: MUTED }))
  const sortedLogs = [...npcLogs].sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)))
  for (const log of sortedLogs) {
    children.push(heading(text(log.title) || 'Untitled encounter', 2))
    children.push(keyValue('NPC', log.npcName))
    children.push(keyValue('Recorded', dateLabel(log.createdAt)))
    children.push(...richTextParagraphs(log.content))
    addTagsAndEmptyFallback(children, log.tags)
  }

  children.push(heading('Party vault & treasure', 1))
  children.push(keyValue('Platinum', currency.pp))
  children.push(keyValue('Gold', currency.gp))
  children.push(keyValue('Silver', currency.sp))
  children.push(keyValue('Copper', currency.cp))
  if (!loot.length) children.push(paragraph('No loot items have been recorded.', { italic: true, color: MUTED }))
  for (const item of loot) {
    children.push(heading(text(item.name) || 'Unidentified item', 2))
    children.push(keyValue('Type', item.kind))
    children.push(keyValue('Quantity', item.quantity))
    children.push(keyValue('Value (GP each)', item.valueGp))
    if (text(item.description)) children.push(paragraph(text(item.description)))
    addTagsAndEmptyFallback(children, item.tags)
  }

  children.push(heading('Character sheets', 1))
  if (!characters.length) children.push(paragraph('No character sheets have been recorded.', { italic: true, color: MUTED }))
  for (const character of characters) {
    children.push(heading(text(character.name) || 'Unnamed character', 2))
    children.push(keyValue('Species / ancestry', character.species))
    children.push(keyValue('Class and level', `${text(character.className) || 'Unspecified'} ${Number(character.level ?? 1)}`))
    children.push(keyValue('Background', character.background))
    children.push(keyValue('Alignment', character.alignment))
    children.push(keyValue('Experience', character.experience))
    children.push(keyValue('HP', `${Number(character.hp ?? 0)} / ${Number(character.maxHp ?? 0)}`))
    children.push(keyValue('AC', character.ac))
    children.push(keyValue('Initiative', character.initiative))
    children.push(keyValue('Speed', `${Number(character.speed ?? 0)} ft`))
    children.push(keyValue('Proficiency bonus', character.proficiency))
    children.push(paragraph('Ability scores', { bold: true, color: GOLD, before: 100, after: 60 }))
    children.push(paragraph(`STR ${character.str ?? 10} · DEX ${character.dex ?? 10} · CON ${character.con ?? 10} · INT ${character.int ?? 10} · WIS ${character.wis ?? 10} · CHA ${character.cha ?? 10}`))
    children.push(paragraph(`Passive Perception ${character.passivePerception ?? '—'} · Passive Insight ${character.passiveInsight ?? '—'} · Passive Investigation ${character.passiveInvestigation ?? '—'}`))
    for (const [label, key] of [['Backstory','backstory'],['Personality traits','personalityTraits'],['Ideals','ideals'],['Bonds','bonds'],['Flaws','flaws']] as const) {
      if (text(character[key])) { children.push(paragraph(label, { bold: true, color: GOLD, before: 70, after: 50 })); children.push(...richTextParagraphs(character[key])) }
    }
    const abilities = Array.isArray(character.abilities) ? character.abilities as ArchiveRecord[] : []
    if (abilities.length) {
      children.push(paragraph('Attacks, abilities & spells', { bold: true, color: GOLD, before: 100, after: 60 }))
      for (const ability of abilities) {
        children.push(paragraph(`${text(ability.name) || 'Unnamed ability'} (${text(ability.kind) || 'Ability'})`, { bold: true, after: 40 }))
        children.push(keyValue('Roll formula', ability.formula))
        children.push(keyValue('Uses / resources', ability.uses))
        if (text(ability.detail)) children.push(paragraph(text(ability.detail), { after: 110 }))
      }
    }
  }

  children.push(heading('Scratch pad', 1))
  children.push(...richTextParagraphs(content.scratch || 'No scratch-pad notes have been recorded.'))
  addTagsAndEmptyFallback(children, content.scratchTags)

  children.push(heading('Roll history', 1))
  if (!rolls.length) children.push(paragraph('No rolls have been recorded.', { italic: true, color: MUTED }))
  for (const roll of rolls) {
    const roller = characters.find(character => Number(character.id) === Number(roll.characterId))
    children.push(paragraph(`${dateLabel(roll.createdAt)} · ${text(roll.abilityName) || 'Roll'} · ${text(roll.formula)}`, { bold: true, after: 50 }))
    if (roller) children.push(keyValue('Character', roller.name))
    const dice = Array.isArray(roll.rolls) ? roll.rolls.join(', ') : ''
    children.push(paragraph(`Dice: ${dice || '—'} · Modifier: ${Number(roll.modifier ?? 0)} · Total: ${Number(roll.total ?? 0)}`))
    if (text(roll.detail)) children.push(paragraph(text(roll.detail), { color: MUTED }))
  }

  const document = new Document({
    creator: 'Spellbook & Quill',
    lastModifiedBy: 'Spellbook & Quill',
    title: `${text(campaign.name) || 'Campaign'} — Campaign Archive`,
    subject: 'Local campaign archive exported from Spellbook & Quill',
    description: 'Readable campaign export generated locally by Spellbook & Quill.',
    styles: {
      default: {
        document: { run: { font: 'Aptos', size: 21, color: DARK }, paragraph: { spacing: { after: 100, line: 276 } } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 900, right: 960, bottom: 900, left: 960 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${text(campaign.name) || 'Campaign'}  •  Exported ${dateLabel(backup.exportedAt)}`, font: 'Aptos', size: 16, color: MUTED })] })] }) },
      children,
    }],
  })
  return Packer.toBuffer(document)
}

export function campaignWordFilename(campaignName: string): string {
  return `${slug(campaignName)}-campaign-archive.docx`
}
