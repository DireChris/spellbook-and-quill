import Database from 'better-sqlite3'
import { app } from 'electron'
import { randomInt } from 'node:crypto'
import { join } from 'node:path'
import type {
  Ability, CharacterStats, Currency, DashboardData, EntityType, LootInput, LootItem, Note, NoteInput,
  Npc, NpcInput, NpcLog, NpcLogInput, Objective, Quest, QuestInput, RollLog, SearchResult, TagInput,
} from '../shared/types'

let db: Database.Database

const now = () => new Date().toISOString()
const str = (value: unknown, max = 100_000) => String(value ?? '').slice(0, max)
const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const allowedEntityTypes = new Set<EntityType>(['note', 'quest', 'scratch', 'npc', 'npc_log', 'loot'])
const allowedStatus = new Set(['In Progress', 'Completed', 'Failed', 'On Hold'])
const allowedStanding = new Set(['Friendly', 'Neutral', 'Hostile'])
const allowedLootKind = new Set(['Item', 'Magic Item', 'Weapon', 'Armour', 'Other'])

function schema() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT 'Untitled note', content TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'session' CHECK(kind IN ('session','lore','scratch')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, giver TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'In Progress' CHECK(status IN ('In Progress','Completed','Failed','On Hold')),
      rewards TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), is_side INTEGER NOT NULL DEFAULT 0 CHECK(is_side IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, faction TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      standing TEXT NOT NULL DEFAULT 'Neutral' CHECK(standing IN ('Friendly','Neutral','Hostile')),
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS npc_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
      npc_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scratch_pad (
      id INTEGER PRIMARY KEY CHECK(id=1), content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS party_currency (
      id INTEGER PRIMARY KEY CHECK(id=1), pp INTEGER NOT NULL DEFAULT 0 CHECK(pp>=0), gp INTEGER NOT NULL DEFAULT 0 CHECK(gp>=0),
      sp INTEGER NOT NULL DEFAULT 0 CHECK(sp>=0), cp INTEGER NOT NULL DEFAULT 0 CHECK(cp>=0), updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loot_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Item' CHECK(kind IN ('Item','Magic Item','Weapon','Armour','Other')), quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1),
      description TEXT NOT NULL DEFAULT '', value_gp REAL NOT NULL DEFAULT 0 CHECK(value_gp>=0), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS taggings (
      entity_type TEXT NOT NULL CHECK(entity_type IN ('note','quest','scratch','npc','npc_log','loot')), entity_id INTEGER NOT NULL, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(entity_type, entity_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_taggings_entity ON taggings(entity_type, entity_id);
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, class_name TEXT NOT NULL DEFAULT 'Adventurer', level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),
      hp INTEGER NOT NULL DEFAULT 24, max_hp INTEGER NOT NULL DEFAULT 24 CHECK(max_hp>=1), ac INTEGER NOT NULL DEFAULT 15,
      initiative INTEGER NOT NULL DEFAULT 2, speed INTEGER NOT NULL DEFAULT 30, proficiency INTEGER NOT NULL DEFAULT 2,
      passive_perception INTEGER NOT NULL DEFAULT 14, passive_insight INTEGER NOT NULL DEFAULT 12, passive_investigation INTEGER NOT NULL DEFAULT 11,
      str INTEGER NOT NULL DEFAULT 10, dex INTEGER NOT NULL DEFAULT 14, con INTEGER NOT NULL DEFAULT 12,
      int INTEGER NOT NULL DEFAULT 13, wis INTEGER NOT NULL DEFAULT 16, cha INTEGER NOT NULL DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Ability' CHECK(kind IN ('Spell','Ability','Attack')), detail TEXT NOT NULL DEFAULT '',
      formula TEXT NOT NULL DEFAULT '1d20', uses TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS roll_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ability_name TEXT NOT NULL, formula TEXT NOT NULL,
      rolls_json TEXT NOT NULL DEFAULT '[]', modifier INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quests_updated ON quests(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_npcs_name ON npcs(name COLLATE NOCASE);
    INSERT OR IGNORE INTO scratch_pad(id, content, updated_at) VALUES (1, '', '${now()}');
    INSERT OR IGNORE INTO party_currency(id, pp, gp, sp, cp, updated_at) VALUES (1, 2, 146, 38, 12, '${now()}');
  `)
  seed()
}

function seed() {
  const hasNotes = (db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n > 0
  if (hasNotes) return
  const t = now()
  const insertNote = db.prepare('INSERT INTO notes(title,content,kind,created_at,updated_at) VALUES(?,?,?,?,?)')
  const noteId = Number(insertNote.run('The Lantern in the Fen', '<h2>Session 07 · A light that should not be burning</h2><p>The rain has not stopped for three days. On the far bank, a lantern swings in a window of the abandoned watch-house.</p><blockquote data-callout="read-aloud"><p>A pale gold light spills over black water. Something beneath the surface answers it with a slow, patient knock.</p></blockquote><p><strong>Clues:</strong> the ferryman refuses to cross after dusk; the mud bears barefoot prints that end at the waterline.</p>', 'session', t, t).lastInsertRowid)
  const loreId = Number(insertNote.run('The Old Road', '<p>Locals say the old imperial road was sealed after the third bell rang beneath the earth. No map agrees on where it begins.</p>', 'lore', t, t).lastInsertRowid)
  addTags({ entityType: 'note', entityId: noteId, tags: ['session-07', 'mystery', 'fen'] })
  addTags({ entityType: 'note', entityId: loreId, tags: ['lore', 'worldbuilding'] })

  const questId = Number(db.prepare(`INSERT INTO quests(name,giver,status,rewards,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run('The Fen-Lantern', 'Mara Vell, ferrymaster', 'In Progress', '250 gp · A map to the buried road', 'The light appears only when the tide turns. Mara wants proof the watch-house is empty.', t, t).lastInsertRowid)
  db.prepare('INSERT INTO objectives(quest_id,title,done,is_side,sort_order) VALUES(?,?,?,?,?)').run(questId, 'Reach the watch-house before midnight', 0, 0, 0)
  db.prepare('INSERT INTO objectives(quest_id,title,done,is_side,sort_order) VALUES(?,?,?,?,?)').run(questId, 'Ask the ferrymaster about the third bell', 1, 1, 1)
  addTags({ entityType: 'quest', entityId: questId, tags: ['mystery', 'riverlands'] })

  const npcId = Number(db.prepare(`INSERT INTO npcs(name,faction,location,standing,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run('Mara Vell', 'Ferry Guild', 'Sableford Crossing', 'Neutral', 'Keeps a silver bell wrapped in oilcloth. Won’t discuss the watch-house after sunset.', t, t).lastInsertRowid)
  addTags({ entityType: 'npc', entityId: npcId, tags: ['quest-giver', 'knows-more'] })
  db.prepare(`INSERT INTO npc_logs(npc_id,npc_name,title,content,created_at) VALUES(?,?,?,?,?)`)
    .run(npcId, 'Mara Vell', 'A nervous warning', '“If it rings a fourth time, do not answer it.” She watched the river while she spoke.', t)

  db.prepare('INSERT INTO characters(name,class_name,level,hp,max_hp,ac,initiative,speed,proficiency,passive_perception,passive_insight,passive_investigation,str,dex,con,int,wis,cha) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('Rowan Ashford', 'Ranger', 5, 34, 42, 16, 3, 35, 3, 15, 13, 12, 12, 16, 14, 10, 16, 11)
  const ability = db.prepare('INSERT INTO abilities(name,kind,detail,formula,uses) VALUES(?,?,?,?,?)')
  ability.run('Longbow', 'Attack', 'Ranged weapon attack · 150/600 ft', '1d20+6', 'Arrow · 1d8+3 damage')
  ability.run('Hunter’s Mark', 'Spell', '1st-level · Concentration · 90 ft', '1d6', 'Bonus action · +1d6 marked damage')
  ability.run('Survival Instinct', 'Ability', 'Wisdom (Survival) check', '1d20+6', 'Proficiency applies')
  ability.run('Cure Wounds', 'Spell', '1st-level · Touch', '1d8+3', 'Restores hit points')
  const lootId = Number(db.prepare('INSERT INTO loot_items(name,kind,quantity,description,value_gp,created_at) VALUES(?,?,?,?,?,?)')
    .run('Moon-silver signet', 'Magic Item', 1, 'A signet engraved with a crescent over dark water. It feels warm at low tide.', 75, t).lastInsertRowid)
  addTags({ entityType: 'loot', entityId: lootId, tags: ['unidentified', 'fen'] })
}

function getTags(type: EntityType, id: number): string[] {
  return (db.prepare(`SELECT tags.name FROM taggings JOIN tags ON tags.id=taggings.tag_id WHERE entity_type=? AND entity_id=? ORDER BY tags.name COLLATE NOCASE`)
    .all(type, id) as Array<{ name: string }>).map(row => row.name)
}

function addTags(input: TagInput) {
  if (!allowedEntityTypes.has(input.entityType) || !Number.isSafeInteger(input.entityId) || input.entityId <= 0) throw new Error('Invalid tag target')
  const tags = [...new Set(input.tags.map(tag => str(tag, 32).trim().replace(/^#/, '').replace(/\s+/g, '-')).filter(tag => /^[\p{L}\p{N}_-]{1,32}$/u.test(tag)).slice(0, 24))]
  const insertTag = db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING')
  const findTag = db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE')
  const insertTagging = db.prepare('INSERT OR IGNORE INTO taggings(entity_type,entity_id,tag_id) VALUES(?,?,?)')
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM taggings WHERE entity_type=? AND entity_id=?').run(input.entityType, input.entityId)
    for (const tag of tags) {
      insertTag.run(tag)
      const row = findTag.get(tag) as { id: number }
      insertTagging.run(input.entityType, input.entityId, row.id)
    }
  })
  tx()
}

function toNote(row: any): Note { return { id: row.id, title: row.title, content: row.content, kind: row.kind, createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('note', row.id) } }
function toQuest(row: any): Quest {
  const objectives = db.prepare('SELECT * FROM objectives WHERE quest_id=? ORDER BY sort_order,id').all(row.id) as any[]
  return { id: row.id, name: row.name, giver: row.giver, status: row.status, rewards: row.rewards, notes: row.notes,
    objectives: objectives.map(o => ({ id: o.id, questId: o.quest_id, title: o.title, done: Boolean(o.done), isSide: Boolean(o.is_side), sortOrder: o.sort_order })),
    createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('quest', row.id) }
}
function toNpc(row: any): Npc { return { id: row.id, name: row.name, faction: row.faction, location: row.location, standing: row.standing, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('npc', row.id) } }
function toNpcLog(row: any): NpcLog { return { id: row.id, npcId: row.npc_id ?? null, npcName: row.npc_name, title: row.title, content: row.content, createdAt: row.created_at, tags: getTags('npc_log', row.id) } }
function toLoot(row: any): LootItem { return { id: row.id, name: row.name, kind: row.kind, quantity: row.quantity, description: row.description, valueGp: row.value_gp, createdAt: row.created_at, tags: getTags('loot', row.id) } }
function toAbility(row: any): Ability { return { id: row.id, name: row.name, kind: row.kind, detail: row.detail, formula: row.formula, uses: row.uses } }
function toRoll(row: any): RollLog { return { id: row.id, abilityName: row.ability_name, formula: row.formula, rolls: JSON.parse(row.rolls_json), modifier: row.modifier, total: row.total, detail: row.detail, createdAt: row.created_at } }
function getCurrency(): Currency { const row = db.prepare('SELECT pp,gp,sp,cp FROM party_currency WHERE id=1').get() as Currency; return row }
function getCharacter(): CharacterStats {
  const row = db.prepare('SELECT * FROM characters ORDER BY id LIMIT 1').get() as any
  if (!row) throw new Error('No character configured')
  return { id: row.id, name: row.name, className: row.class_name, level: row.level, hp: row.hp, maxHp: row.max_hp, ac: row.ac,
    initiative: row.initiative, speed: row.speed, proficiency: row.proficiency, passivePerception: row.passive_perception,
    passiveInsight: row.passive_insight, passiveInvestigation: row.passive_investigation,
    str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha }
}

export function initDatabase() {
  const filename = join(app.getPath('userData'), 'spellbook-and-quill.sqlite')
  db = new Database(filename)
  schema()
}

export function getDashboard(): DashboardData {
  const notes = (db.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all() as any[]).map(toNote)
  const quests = (db.prepare(`SELECT * FROM quests ORDER BY CASE status WHEN 'In Progress' THEN 0 WHEN 'On Hold' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END, updated_at DESC`).all() as any[]).map(toQuest)
  const npcs = (db.prepare('SELECT * FROM npcs ORDER BY name COLLATE NOCASE').all() as any[]).map(toNpc)
  const npcLogs = (db.prepare('SELECT * FROM npc_logs ORDER BY created_at DESC LIMIT 30').all() as any[]).map(toNpcLog)
  const loot = (db.prepare('SELECT * FROM loot_items ORDER BY created_at DESC').all() as any[]).map(toLoot)
  const abilities = (db.prepare('SELECT * FROM abilities ORDER BY CASE kind WHEN \'Attack\' THEN 0 WHEN \'Ability\' THEN 1 ELSE 2 END, name').all() as any[]).map(toAbility)
  const rolls = (db.prepare('SELECT * FROM roll_log ORDER BY created_at DESC LIMIT 30').all() as any[]).map(toRoll)
  const scratch = (db.prepare('SELECT content FROM scratch_pad WHERE id=1').get() as { content: string }).content
  return { notes, quests, npcs, npcLogs, loot, currency: getCurrency(), abilities, character: getCharacter(), rolls, scratch }
}

export function saveNote(input: NoteInput): Note {
  const title = str(input.title, 180).trim() || 'Untitled note'
  const content = str(input.content)
  const kind = input.kind === 'lore' ? 'lore' : input.kind === 'scratch' ? 'scratch' : 'session'
  const t = now()
  let id = input.id
  if (id && db.prepare('SELECT id FROM notes WHERE id=?').get(id)) {
    db.prepare('UPDATE notes SET title=?,content=?,kind=?,updated_at=? WHERE id=?').run(title, content, kind, t, id)
  } else {
    id = Number(db.prepare('INSERT INTO notes(title,content,kind,created_at,updated_at) VALUES(?,?,?,?,?)').run(title, content, kind, t, t).lastInsertRowid)
  }
  return toNote(db.prepare('SELECT * FROM notes WHERE id=?').get(id))
}
export function deleteNote(id: number) { db.prepare('DELETE FROM notes WHERE id=?').run(num(id)); db.prepare('DELETE FROM taggings WHERE entity_type=\'note\' AND entity_id=?').run(num(id)); return true }

export function saveQuest(input: QuestInput): Quest {
  const name = str(input.name, 180).trim()
  if (!name) throw new Error('Quest name is required')
  const giver = str(input.giver, 180); const rewards = str(input.rewards); const notes = str(input.notes)
  const status = allowedStatus.has(input.status) ? input.status : 'In Progress'
  const t = now(); let id = input.id
  const tx = db.transaction(() => {
    if (id && db.prepare('SELECT id FROM quests WHERE id=?').get(id)) db.prepare('UPDATE quests SET name=?,giver=?,status=?,rewards=?,notes=?,updated_at=? WHERE id=?').run(name,giver,status,rewards,notes,t,id)
    else id = Number(db.prepare('INSERT INTO quests(name,giver,status,rewards,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(name,giver,status,rewards,notes,t,t).lastInsertRowid)
    db.prepare('DELETE FROM objectives WHERE quest_id=?').run(id)
    const insert = db.prepare('INSERT INTO objectives(quest_id,title,done,is_side,sort_order) VALUES(?,?,?,?,?)')
    input.objectives.slice(0, 100).filter(o => str(o.title, 300).trim()).forEach((o, index) => insert.run(id, str(o.title, 300).trim(), o.done ? 1 : 0, o.isSide ? 1 : 0, index))
  })
  tx()
  return toQuest(db.prepare('SELECT * FROM quests WHERE id=?').get(id))
}
export function deleteQuest(id: number) { db.prepare('DELETE FROM quests WHERE id=?').run(num(id)); db.prepare('DELETE FROM taggings WHERE entity_type=\'quest\' AND entity_id=?').run(num(id)); return true }

export function saveNpc(input: NpcInput): Npc {
  const name = str(input.name, 180).trim(); if (!name) throw new Error('NPC name is required')
  const faction = str(input.faction, 180); const location = str(input.location, 180); const notes = str(input.notes)
  const standing = allowedStanding.has(input.standing) ? input.standing : 'Neutral'; const t = now(); let id = input.id
  if (id && db.prepare('SELECT id FROM npcs WHERE id=?').get(id)) db.prepare('UPDATE npcs SET name=?,faction=?,location=?,standing=?,notes=?,updated_at=? WHERE id=?').run(name,faction,location,standing,notes,t,id)
  else id = Number(db.prepare('INSERT INTO npcs(name,faction,location,standing,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(name,faction,location,standing,notes,t,t).lastInsertRowid)
  return toNpc(db.prepare('SELECT * FROM npcs WHERE id=?').get(id))
}
export function deleteNpc(id: number) { db.prepare('DELETE FROM npcs WHERE id=?').run(num(id)); db.prepare('DELETE FROM taggings WHERE entity_type=\'npc\' AND entity_id=?').run(num(id)); return true }
export function saveNpcLog(input: NpcLogInput): NpcLog {
  const title = str(input.title, 180).trim() || 'Untitled log'; const content = str(input.content); const npcName = str(input.npcName, 180)
  const npcId = input.npcId && db.prepare('SELECT id FROM npcs WHERE id=?').get(input.npcId) ? input.npcId : null
  const id = Number(db.prepare('INSERT INTO npc_logs(npc_id,npc_name,title,content,created_at) VALUES(?,?,?,?,?)').run(npcId,npcName,title,content,now()).lastInsertRowid)
  return toNpcLog(db.prepare('SELECT * FROM npc_logs WHERE id=?').get(id))
}
export function saveScratch(content: string) {
  db.prepare('INSERT INTO scratch_pad(id,content,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at').run(str(content, 16_000), now())
  return str(content, 16_000)
}
export function saveCurrency(currency: Currency): Currency {
  const safe: Currency = { pp: Math.max(0, Math.floor(num(currency.pp))), gp: Math.max(0, Math.floor(num(currency.gp))), sp: Math.max(0, Math.floor(num(currency.sp))), cp: Math.max(0, Math.floor(num(currency.cp))) }
  db.prepare('UPDATE party_currency SET pp=?,gp=?,sp=?,cp=?,updated_at=? WHERE id=1').run(safe.pp,safe.gp,safe.sp,safe.cp,now())
  return safe
}
export function addLoot(input: LootInput): LootItem {
  const name = str(input.name, 180).trim(); if (!name) throw new Error('Item name is required')
  const kind = allowedLootKind.has(input.kind) ? input.kind : 'Item'
  const id = Number(db.prepare('INSERT INTO loot_items(name,kind,quantity,description,value_gp,created_at) VALUES(?,?,?,?,?,?)').run(name,kind,Math.max(1, Math.floor(num(input.quantity, 1))),str(input.description),Math.max(0,num(input.valueGp)),now()).lastInsertRowid)
  return toLoot(db.prepare('SELECT * FROM loot_items WHERE id=?').get(id))
}
export function deleteLoot(id: number) { db.prepare('DELETE FROM loot_items WHERE id=?').run(num(id)); db.prepare('DELETE FROM taggings WHERE entity_type=\'loot\' AND entity_id=?').run(num(id)); return true }
export function saveTags(input: TagInput) { addTags(input); return getTags(input.entityType, input.entityId) }

export function searchAll(query: string): SearchResult[] {
  const q = str(query, 200).trim()
  if (!q) return []
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const results: SearchResult[] = []
  const push = (item: Omit<SearchResult, 'tags'>, type: EntityType) => results.push({ ...item, entityType: type, tags: getTags(type, item.id) })
  ;(db.prepare(`SELECT id,title,content AS body,updated_at AS ts,'note' AS type FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'`).all(pattern, pattern) as any[])
    .forEach(r => push({ id:r.id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts },'note'))
  ;(db.prepare(`SELECT id,name AS title,notes AS body,updated_at AS ts,status AS meta FROM quests WHERE name LIKE ? ESCAPE '\\' OR giver LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR rewards LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM objectives o WHERE o.quest_id=quests.id AND o.title LIKE ? ESCAPE '\\')`).all(pattern,pattern,pattern,pattern,pattern) as any[])
    .forEach(r => push({id:r.id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,meta:r.meta},'quest'))
  const scratch = db.prepare('SELECT content,updated_at FROM scratch_pad WHERE id=1 AND content LIKE ? ESCAPE \'\\\'').get(pattern) as any
  if (scratch) push({id:1,title:'Scratch Pad',excerpt:plainText(scratch.content).slice(0,180),updatedAt:scratch.updated_at},'scratch')
  ;(db.prepare(`SELECT id,name AS title,notes AS body,updated_at AS ts,faction AS meta FROM npcs WHERE name LIKE ? ESCAPE '\\' OR faction LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'`).all(pattern,pattern,pattern,pattern) as any[])
    .forEach(r => push({id:r.id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,meta:r.meta},'npc'))
  ;(db.prepare(`SELECT id,title,content AS body,created_at AS ts,npc_name AS meta FROM npc_logs WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR npc_name LIKE ? ESCAPE '\\'`).all(pattern,pattern,pattern) as any[])
    .forEach(r => push({id:r.id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,meta:r.meta},'npc_log'))
  ;(db.prepare(`SELECT id,name AS title,description AS body,created_at AS ts,kind AS meta FROM loot_items WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'`).all(pattern,pattern) as any[])
    .forEach(r => push({id:r.id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,meta:r.meta},'loot'))
  const lower = q.toLocaleLowerCase()
  const tagged = db.prepare(`SELECT entity_type,entity_id FROM taggings JOIN tags ON tags.id=taggings.tag_id WHERE tags.name LIKE ? ESCAPE '\\'`).all(pattern) as any[]
  for (const row of tagged) {
    if (!allowedEntityTypes.has(row.entity_type)) continue
    const exists = results.some(r => r.entityType === row.entity_type && r.id === row.entity_id)
    if (exists) continue
    const result = lookupSearchEntity(row.entity_type as EntityType, row.entity_id)
    if (result && result.tags.some(tag => tag.toLocaleLowerCase().includes(lower))) results.push(result)
  }
  return results.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100)
}
function lookupSearchEntity(type: EntityType, id: number): SearchResult | null {
  let r: any
  if (type === 'note') { r = db.prepare('SELECT id,title,content AS body,updated_at AS ts FROM notes WHERE id=?').get(id); if (r) return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id)} }
  if (type === 'quest') { r = db.prepare('SELECT id,name AS title,notes AS body,updated_at AS ts,status AS meta FROM quests WHERE id=?').get(id); if (r) return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id),meta:r.meta} }
  if (type === 'scratch') { r = db.prepare('SELECT content AS body,updated_at AS ts FROM scratch_pad WHERE id=1').get(); if (r) return {entityType:type,id:1,title:'Scratch Pad',excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,1)} }
  if (type === 'npc') { r = db.prepare('SELECT id,name AS title,notes AS body,updated_at AS ts,faction AS meta FROM npcs WHERE id=?').get(id); if (r) return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id),meta:r.meta} }
  if (type === 'npc_log') { r = db.prepare('SELECT id,title,content AS body,created_at AS ts,npc_name AS meta FROM npc_logs WHERE id=?').get(id); if (r) return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id),meta:r.meta} }
  if (type === 'loot') { r = db.prepare('SELECT id,name AS title,description AS body,created_at AS ts,kind AS meta FROM loot_items WHERE id=?').get(id); if (r) return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id),meta:r.meta} }
  return null
}
function plainText(html: string) { return str(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g,' ').trim() }

function rollDice(formulaInput: string): { rolls: number[]; modifier: number; total: number; formula: string } {
  const formula = str(formulaInput, 32).replace(/\s+/g, '').toLowerCase()
  const match = formula.match(/^(\d{1,2})d(\d{1,3})([+-]\d{1,4})?$/)
  if (!match) throw new Error('Roll formula must look like 1d20+5')
  const count = Number(match[1]); const sides = Number(match[2]); const modifier = Number(match[3] || 0)
  if (count < 1 || count > 20 || sides < 2 || sides > 1000) throw new Error('Dice formula is outside allowed limits')
  const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1))
  return { rolls, modifier, total: rolls.reduce((sum, roll) => sum + roll, 0) + modifier, formula }
}
export function rollAbility(abilityId: number): RollLog {
  const row = db.prepare('SELECT * FROM abilities WHERE id=?').get(num(abilityId)) as any
  if (!row) throw new Error('Ability not found')
  const result = rollDice(row.formula)
  const detail = `${row.detail}${row.uses ? ` · ${row.uses}` : ''}`
  const id = Number(db.prepare('INSERT INTO roll_log(ability_name,formula,rolls_json,modifier,total,detail,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(row.name,result.formula,JSON.stringify(result.rolls),result.modifier,result.total,detail,now()).lastInsertRowid)
  return toRoll(db.prepare('SELECT * FROM roll_log WHERE id=?').get(id))
}
export function closeDatabase() { if (db?.open) db.close() }
