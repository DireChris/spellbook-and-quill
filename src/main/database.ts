import initSqlJs from 'sql.js'
import { app } from 'electron'
import { randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  Ability, AbilityInput, Campaign, CampaignBackup, CampaignInput, CharacterStats, CharacterStatsInput, Currency, DashboardData, EntityType, LootInput, LootItem, Note, NoteInput,
  Npc, NpcInput, NpcLog, NpcLogInput, Objective, Quest, QuestInput, RollLog, SearchResult, TagInput, WorkspaceState,
} from '../shared/types'

/**
 * sql.js runs SQLite in WebAssembly, so it does not compile a native addon.
 * The adapter below intentionally mirrors the small synchronous API used by
 * this module (prepare/get/all/run/exec/transaction). The live database is
 * in-memory and is atomically exported to a standard SQLite file after writes.
 */
type SqlParam = string | number | null | Uint8Array
type SqlRow = Record<string, any>
type RunResult = { changes: number; lastInsertRowid: number }

class SqlJsStatement {
  constructor(private readonly owner: SqlJsDatabaseAdapter, private readonly sql: string) {}
  get(...params: SqlParam[]): SqlRow | undefined { return this.owner.get(this.sql, params) }
  all(...params: SqlParam[]): SqlRow[] { return this.owner.all(this.sql, params) }
  run(...params: SqlParam[]): RunResult { return this.owner.run(this.sql, params) }
}

class SqlJsDatabaseAdapter {
  private timer: ReturnType<typeof setTimeout> | undefined
  private transactionDepth = 0
  private dirty = false
  public open = true

  constructor(private readonly raw: any, private readonly filename: string) {}

  exec(sql: string): void {
    this.ensureOpen()
    this.raw.exec(sql)
    if (/\b(CREATE|INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|VACUUM)\b/i.test(sql)) this.markDirty()
  }

  prepare(sql: string): SqlJsStatement {
    this.ensureOpen()
    return new SqlJsStatement(this, sql)
  }

  get(sql: string, params: SqlParam[] = []): SqlRow | undefined {
    this.ensureOpen()
    const statement = this.raw.prepare(sql)
    try {
      if (params.length) statement.bind(params)
      return statement.step() ? statement.getAsObject() as SqlRow : undefined
    } finally {
      statement.free()
    }
  }

  all(sql: string, params: SqlParam[] = []): SqlRow[] {
    this.ensureOpen()
    const statement = this.raw.prepare(sql)
    try {
      if (params.length) statement.bind(params)
      const rows: SqlRow[] = []
      while (statement.step()) rows.push(statement.getAsObject() as SqlRow)
      return rows
    } finally {
      statement.free()
    }
  }

  run(sql: string, params: SqlParam[] = []): RunResult {
    this.ensureOpen()
    const statement = this.raw.prepare(sql)
    let changes = 0
    try {
      if (params.length) statement.bind(params)
      // A single step executes INSERT/UPDATE/DELETE statements.
      statement.step()
      changes = this.raw.getRowsModified() as number
    } finally {
      statement.free()
    }
    const row = this.get('SELECT last_insert_rowid() AS id')
    this.markDirty()
    return { changes, lastInsertRowid: Number(row?.id ?? 0) }
  }

  transaction<T extends (...args: any[]) => any>(callback: T): T {
    const wrapped = ((...args: any[]) => {
      this.ensureOpen()
      this.raw.run('BEGIN IMMEDIATE')
      this.transactionDepth += 1
      try {
        const result = callback(...args)
        this.raw.run('COMMIT')
        this.transactionDepth -= 1
        this.schedulePersist()
        return result
      } catch (error) {
        try { this.raw.run('ROLLBACK') } finally { this.transactionDepth -= 1 }
        throw error
      }
    }) as T
    return wrapped
  }

  /** Flush pending changes immediately. Used at startup and shutdown. */
  flush(): void {
    if (!this.open || !this.dirty) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const bytes = this.raw.export() as Uint8Array
    const tempFilename = `${this.filename}.tmp`
    writeFileSync(tempFilename, Buffer.from(bytes), { mode: 0o600 })
    renameSync(tempFilename, this.filename)
    // export() reopens the sql.js database and resets connection pragmas.
    // Re-enable foreign keys so ON DELETE/UPDATE constraints stay enforced.
    this.raw.run('PRAGMA foreign_keys = ON')
    this.dirty = false
  }

  close(): void {
    if (!this.open) return
    this.flush()
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.raw.close()
    this.open = false
  }

  private ensureOpen(): void {
    if (!this.open) throw new Error('The campaign database is closed')
  }

  private markDirty(): void {
    this.dirty = true
    this.schedulePersist()
  }

  private schedulePersist(): void {
    if (!this.open || this.transactionDepth > 0 || !this.dirty) return
    if (this.timer) clearTimeout(this.timer)
    // Coalesce rapid autosaves into a single full-file export while keeping
    // the database durable during normal use. close() always flushes eagerly.
    this.timer = setTimeout(() => {
      this.timer = undefined
      try { this.flush() }
      catch (error) { console.error('Unable to persist campaign database:', error) }
    }, 150)
  }
}

let db: SqlJsDatabaseAdapter
let activeCampaignId = 1

const now = () => new Date().toISOString()
const str = (value: unknown, max = 100_000) => String(value ?? '').slice(0, max)
const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const allowedEntityTypes = new Set<EntityType>(['note', 'quest', 'scratch', 'npc', 'npc_log', 'loot'])
const allowedStatus = new Set(['In Progress', 'Completed', 'Failed', 'On Hold'])
const allowedStanding = new Set(['Friendly', 'Neutral', 'Hostile'])
const allowedLootKind = new Set(['Item', 'Magic Item', 'Weapon', 'Armour', 'Other'])

function getSetting(key: string): string | undefined {
  return (db.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as {value:string}|undefined)?.value
}
function setSetting(key: string, value: string) {
  db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
function toCampaign(row: any): Campaign {
  return { id: row.id, name: row.name, description: row.description, setting: row.setting, ruleset: row.ruleset, imageData: row.image_data || '', createdAt: row.created_at, updatedAt: row.updated_at, lastOpenedAt: row.last_opened_at }
}
function currentCampaign(): Campaign {
  const row = db.prepare('SELECT * FROM campaigns WHERE id=?').get(activeCampaignId)
  if (!row) throw new Error('The active campaign no longer exists')
  return toCampaign(row)
}
function ensureCampaignDefaults(campaignId: number) {
  const t = now()
  db.prepare('INSERT OR IGNORE INTO campaign_currency(campaign_id,pp,gp,sp,cp,updated_at) VALUES(?,0,0,0,0,?)').run(campaignId,t)
  db.prepare('INSERT OR IGNORE INTO campaign_scratch(campaign_id,content,updated_at) VALUES(?,?,?)').run(campaignId,'',t)
  const character = db.prepare('SELECT id FROM characters WHERE campaign_id=? ORDER BY id LIMIT 1').get(campaignId) as {id:number}|undefined
  if (!character) {
    const id = Number(db.prepare(`INSERT INTO characters(campaign_id,name,species,background,alignment,backstory,personality_traits,ideals,bonds,flaws,experience,class_name,level,hp,max_hp,ac,initiative,speed,proficiency,passive_perception,passive_insight,passive_investigation,str,dex,con,int,wis,cha)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(campaignId,'New Adventurer','','','','','','','','',0,'Adventurer',1,10,10,10,0,30,2,10,10,10,10,10,10,10,10,10).lastInsertRowid)
    setSetting(`selected_character_id:${campaignId}`, String(id))
  } else if (!getSetting(`selected_character_id:${campaignId}`) || !db.prepare('SELECT id FROM characters WHERE id=? AND campaign_id=?').get(Number(getSetting(`selected_character_id:${campaignId}`)),campaignId)) {
    setSetting(`selected_character_id:${campaignId}`, String(character.id))
  }
}

function schema() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', setting TEXT NOT NULL DEFAULT '', ruleset TEXT NOT NULL DEFAULT 'D&D 5e', image_data TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO campaigns(id,name,description,setting,ruleset,image_data,created_at,updated_at,last_opened_at) VALUES(1,'My First Campaign','','','D&D 5e','',datetime('now'),datetime('now'),datetime('now'));
    INSERT OR IGNORE INTO app_settings(key,value) VALUES('active_campaign_id','1');
    -- sql.js is an in-memory SQLite engine; persistence is handled by atomic exports.
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL DEFAULT 'Untitled note', content TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'session' CHECK(kind IN ('session','lore','scratch')), session_number INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, giver TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'In Progress' CHECK(status IN ('In Progress','Completed','Failed','On Hold')),
      rewards TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), is_side INTEGER NOT NULL DEFAULT 0 CHECK(is_side IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS npcs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, faction TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      standing TEXT NOT NULL DEFAULT 'Neutral' CHECK(standing IN ('Friendly','Neutral','Hostile')),
      notes TEXT NOT NULL DEFAULT '', image_data TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS npc_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Item' CHECK(kind IN ('Item','Magic Item','Weapon','Armour','Other')), quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1),
      description TEXT NOT NULL DEFAULT '', value_gp REAL NOT NULL DEFAULT 0 CHECK(value_gp>=0), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS taggings (
      entity_type TEXT NOT NULL CHECK(entity_type IN ('note','quest','scratch','npc','npc_log','loot')), entity_id INTEGER NOT NULL, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(entity_type, entity_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_taggings_entity ON taggings(entity_type, entity_id);
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, species TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', alignment TEXT NOT NULL DEFAULT '', backstory TEXT NOT NULL DEFAULT '', personality_traits TEXT NOT NULL DEFAULT '', ideals TEXT NOT NULL DEFAULT '', bonds TEXT NOT NULL DEFAULT '', flaws TEXT NOT NULL DEFAULT '', experience INTEGER NOT NULL DEFAULT 0, class_name TEXT NOT NULL DEFAULT 'Adventurer', level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),
      hp INTEGER NOT NULL DEFAULT 24, max_hp INTEGER NOT NULL DEFAULT 24 CHECK(max_hp>=1), ac INTEGER NOT NULL DEFAULT 15,
      initiative INTEGER NOT NULL DEFAULT 2, speed INTEGER NOT NULL DEFAULT 30, proficiency INTEGER NOT NULL DEFAULT 2,
      passive_perception INTEGER NOT NULL DEFAULT 14, passive_insight INTEGER NOT NULL DEFAULT 12, passive_investigation INTEGER NOT NULL DEFAULT 11,
      str INTEGER NOT NULL DEFAULT 10, dex INTEGER NOT NULL DEFAULT 14, con INTEGER NOT NULL DEFAULT 12,
      int INTEGER NOT NULL DEFAULT 13, wis INTEGER NOT NULL DEFAULT 16, cha INTEGER NOT NULL DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, character_id INTEGER, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Ability' CHECK(kind IN ('Spell','Ability','Attack')), detail TEXT NOT NULL DEFAULT '',
      formula TEXT NOT NULL DEFAULT '1d20', uses TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS roll_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL DEFAULT 1, character_id INTEGER, ability_name TEXT NOT NULL, formula TEXT NOT NULL,
      rolls_json TEXT NOT NULL DEFAULT '[]', modifier INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaign_currency (campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE, pp INTEGER NOT NULL DEFAULT 0, gp INTEGER NOT NULL DEFAULT 0, sp INTEGER NOT NULL DEFAULT 0, cp INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS campaign_scratch (campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE, content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
    INSERT OR IGNORE INTO scratch_pad(id, content, updated_at) VALUES (1, '', '${now()}');
    INSERT OR IGNORE INTO party_currency(id, pp, gp, sp, cp, updated_at) VALUES (1, 2, 146, 38, 12, '${now()}');
  `)
  // Migrate existing single-campaign databases in place. Adding nullable/defaulted
  // columns keeps every existing record and its primary key intact.
  ensureColumn('notes', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('notes', 'session_number', 'INTEGER')
  ensureColumn('quests', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('npcs', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('npcs', 'image_data', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('npc_logs', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('loot_items', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('characters', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('characters', 'species', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'background', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'alignment', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'backstory', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'personality_traits', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'ideals', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'bonds', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'flaws', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('characters', 'experience', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('abilities', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('abilities', 'character_id', 'INTEGER')
  ensureColumn('roll_log', 'campaign_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn('roll_log', 'character_id', 'INTEGER')
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_campaign_updated ON notes(campaign_id,updated_at DESC); CREATE INDEX IF NOT EXISTS idx_quests_campaign_updated ON quests(campaign_id,updated_at DESC); CREATE INDEX IF NOT EXISTS idx_npcs_campaign_name ON npcs(campaign_id,name COLLATE NOCASE);`)
  db.exec(`
    INSERT OR IGNORE INTO campaign_currency(campaign_id,pp,gp,sp,cp,updated_at) SELECT 1,pp,gp,sp,cp,updated_at FROM party_currency WHERE id=1;
    INSERT OR IGNORE INTO campaign_currency(campaign_id,pp,gp,sp,cp,updated_at) SELECT id,0,0,0,0,datetime('now') FROM campaigns;
    INSERT OR IGNORE INTO campaign_scratch(campaign_id,content,updated_at) SELECT 1,content,updated_at FROM scratch_pad WHERE id=1;
    INSERT OR IGNORE INTO campaign_scratch(campaign_id,content,updated_at) SELECT id,'',datetime('now') FROM campaigns;
    UPDATE abilities SET character_id=(SELECT MIN(id) FROM characters WHERE characters.campaign_id=abilities.campaign_id) WHERE character_id IS NULL;
    -- Older releases keyed the singleton scratch-pad tags with entity_id=1.
    INSERT OR IGNORE INTO taggings(entity_type,entity_id,tag_id) SELECT 'scratch',-1,tag_id FROM taggings WHERE entity_type='scratch' AND entity_id=1;
    DELETE FROM taggings WHERE entity_type='scratch' AND entity_id=1;
    UPDATE app_settings SET value='1' WHERE key='active_campaign_id' AND value NOT IN (SELECT CAST(id AS TEXT) FROM campaigns);
  `)
  const setting = db.prepare("SELECT value FROM app_settings WHERE key='active_campaign_id'").get() as { value: string } | undefined
  activeCampaignId = Number(setting?.value || 1)
  if (!db.prepare('SELECT id FROM campaigns WHERE id=?').get(activeCampaignId)) activeCampaignId = Number((db.prepare('SELECT id FROM campaigns ORDER BY id LIMIT 1').get() as {id:number}|undefined)?.id ?? 1)
  db.prepare("INSERT INTO app_settings(key,value) VALUES('active_campaign_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(activeCampaignId))
  seed()
  db.exec('UPDATE abilities SET character_id=(SELECT MIN(id) FROM characters WHERE characters.campaign_id=abilities.campaign_id) WHERE character_id IS NULL')
  ensureCampaignDefaults(activeCampaignId)
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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

function getTags(type: EntityType, id: number, campaignId = activeCampaignId): string[] {
  const tagId = type === 'scratch' ? -campaignId : id
  return (db.prepare(`SELECT tags.name FROM taggings JOIN tags ON tags.id=taggings.tag_id WHERE entity_type=? AND entity_id=? ORDER BY tags.name COLLATE NOCASE`)
    .all(type, tagId) as Array<{ name: string }>).map(row => row.name)
}

function addTags(input: TagInput) {
  if (!allowedEntityTypes.has(input.entityType) || !Number.isSafeInteger(input.entityId)) throw new Error('Invalid tag target')
  const campaignId = input.campaignId ?? activeCampaignId
  const entityId = input.entityType === 'scratch' ? -campaignId : input.entityId
  if (input.entityType !== 'scratch' && entityId <= 0) throw new Error('Invalid tag target')
  const tags = [...new Set(input.tags.map(tag => str(tag, 64).trim().replace(/^#/, '').replace(/^\[|\]$/g, '').replace(/\s+/g, ' ')).filter(tag => /^[\p{L}\p{N}_: .’'&\/-]{1,64}$/u.test(tag) && tag.trim()).slice(0, 24))]
  const insertTag = db.prepare('INSERT INTO tags(name) VALUES(?) ON CONFLICT(name) DO NOTHING')
  const findTag = db.prepare('SELECT id FROM tags WHERE name=? COLLATE NOCASE')
  const insertTagging = db.prepare('INSERT OR IGNORE INTO taggings(entity_type,entity_id,tag_id) VALUES(?,?,?)')
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM taggings WHERE entity_type=? AND entity_id=?').run(input.entityType, entityId)
    for (const tag of tags) {
      insertTag.run(tag)
      const row = findTag.get(tag) as { id: number }
      insertTagging.run(input.entityType, entityId, row.id)
    }
  })
  tx()
}

function toNote(row: any): Note { return { id: row.id, title: row.title, content: row.content, kind: row.kind, sessionNumber: row.session_number == null ? null : Number(row.session_number), createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('note', row.id, row.campaign_id ?? activeCampaignId) } }
function toQuest(row: any): Quest {
  const objectives = db.prepare('SELECT * FROM objectives WHERE quest_id=? ORDER BY sort_order,id').all(row.id) as any[]
  return { id: row.id, name: row.name, giver: row.giver, status: row.status, rewards: row.rewards, notes: row.notes,
    objectives: objectives.map(o => ({ id: o.id, questId: o.quest_id, title: o.title, done: Boolean(o.done), isSide: Boolean(o.is_side), sortOrder: o.sort_order })),
    createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('quest', row.id, row.campaign_id ?? activeCampaignId) }
}
function toNpc(row: any): Npc { return { id: row.id, name: row.name, faction: row.faction, location: row.location, standing: row.standing, notes: row.notes, imageData: row.image_data || '', createdAt: row.created_at, updatedAt: row.updated_at, tags: getTags('npc', row.id, row.campaign_id ?? activeCampaignId) } }
function toNpcLog(row: any): NpcLog { return { id: row.id, npcId: row.npc_id ?? null, npcName: row.npc_name, title: row.title, content: row.content, createdAt: row.created_at, tags: getTags('npc_log', row.id, row.campaign_id ?? activeCampaignId) } }
function toLoot(row: any): LootItem { return { id: row.id, name: row.name, kind: row.kind, quantity: row.quantity, description: row.description, valueGp: row.value_gp, createdAt: row.created_at, tags: getTags('loot', row.id, row.campaign_id ?? activeCampaignId) } }
function toAbility(row: any): Ability { return { id: row.id, name: row.name, kind: row.kind, detail: row.detail, formula: row.formula, uses: row.uses } }
function toRoll(row: any): RollLog { return { id: row.id, abilityName: row.ability_name, formula: row.formula, rolls: JSON.parse(row.rolls_json), modifier: row.modifier, total: row.total, detail: row.detail, createdAt: row.created_at } }
function getCurrency(campaignId = activeCampaignId): Currency {
  const row = db.prepare('SELECT pp,gp,sp,cp FROM campaign_currency WHERE campaign_id=?').get(campaignId) as Currency | undefined
  return row ?? { pp: 0, gp: 0, sp: 0, cp: 0 }
}
function toCharacter(row: any): CharacterStats {
  return { id: row.id, name: row.name, species: row.species || '', background: row.background || '', alignment: row.alignment || '', backstory: row.backstory || '', personalityTraits: row.personality_traits || '', ideals: row.ideals || '', bonds: row.bonds || '', flaws: row.flaws || '', className: row.class_name, level: row.level, experience: row.experience || 0, hp: row.hp, maxHp: row.max_hp, ac: row.ac,
    initiative: row.initiative, speed: row.speed, proficiency: row.proficiency, passivePerception: row.passive_perception, passiveInsight: row.passive_insight,
    passiveInvestigation: row.passive_investigation, str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha }
}
function getCharacters(campaignId = activeCampaignId): CharacterStats[] {
  return (db.prepare('SELECT * FROM characters WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(toCharacter)
}
function selectedCharacterId(campaignId = activeCampaignId): number {
  ensureCampaignDefaults(campaignId)
  const stored = Number(getSetting(`selected_character_id:${campaignId}`))
  if (Number.isSafeInteger(stored) && db.prepare('SELECT id FROM characters WHERE id=? AND campaign_id=?').get(stored,campaignId)) return stored
  const first = db.prepare('SELECT id FROM characters WHERE campaign_id=? ORDER BY id LIMIT 1').get(campaignId) as {id:number}
  setSetting(`selected_character_id:${campaignId}`, String(first.id))
  return first.id
}
function getCharacter(id = selectedCharacterId()): CharacterStats {
  const row = db.prepare('SELECT * FROM characters WHERE id=? AND campaign_id=?').get(id,activeCampaignId) as any
  if (!row) throw new Error('No character configured for this campaign')
  return toCharacter(row)
}

/** Persist one campaign-specific character sheet. */
export function saveCharacter(input: CharacterStatsInput): CharacterStats {
  const existingId = input.id ?? (getCharacters(activeCampaignId).length ? selectedCharacterId(activeCampaignId) : undefined)
  const values = [
    str(input.name,100).trim() || 'Adventurer', str(input.species,100), str(input.background,160), str(input.alignment,80), str(input.backstory,50_000),
    str(input.personalityTraits,4_000), str(input.ideals,4_000), str(input.bonds,4_000), str(input.flaws,4_000),
    Math.max(0,Math.trunc(num(input.experience))), str(input.className,100).trim() || 'Adventurer',
    Math.max(1,Math.min(20,Math.trunc(num(input.level,1)))), Math.max(0,Math.min(9999,Math.trunc(num(input.hp)))),
    Math.max(1,Math.min(9999,Math.trunc(num(input.maxHp,1)))), Math.max(0,Math.min(100,Math.trunc(num(input.ac)))),
    Math.max(-50,Math.min(100,Math.trunc(num(input.initiative)))), Math.max(0,Math.min(1000,Math.trunc(num(input.speed)))),
    Math.max(-20,Math.min(100,Math.trunc(num(input.proficiency)))), Math.max(0,Math.min(100,Math.trunc(num(input.passivePerception)))),
    Math.max(0,Math.min(100,Math.trunc(num(input.passiveInsight)))), Math.max(0,Math.min(100,Math.trunc(num(input.passiveInvestigation)))),
    ...[input.str,input.dex,input.con,input.int,input.wis,input.cha].map(value=>Math.max(1,Math.min(40,Math.trunc(num(value,10)))))
  ]
  let id: number
  if (existingId && db.prepare('SELECT id FROM characters WHERE id=? AND campaign_id=?').get(existingId,activeCampaignId)) {
    db.prepare(`UPDATE characters SET name=?,species=?,background=?,alignment=?,backstory=?,personality_traits=?,ideals=?,bonds=?,flaws=?,experience=?,class_name=?,level=?,hp=?,max_hp=?,ac=?,initiative=?,speed=?,proficiency=?,passive_perception=?,passive_insight=?,passive_investigation=?,str=?,dex=?,con=?,int=?,wis=?,cha=? WHERE id=? AND campaign_id=?`).run(...values,existingId,activeCampaignId)
    id=existingId
  } else {
    id=Number(db.prepare(`INSERT INTO characters(campaign_id,name,species,background,alignment,backstory,personality_traits,ideals,bonds,flaws,experience,class_name,level,hp,max_hp,ac,initiative,speed,proficiency,passive_perception,passive_insight,passive_investigation,str,dex,con,int,wis,cha)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(activeCampaignId,...values).lastInsertRowid)
  }
  setSetting(`selected_character_id:${activeCampaignId}`,String(id))
  return getCharacter(id)
}

export function createCharacter(): CharacterStats {
  const id=Number(db.prepare(`INSERT INTO characters(campaign_id,name,species,background,alignment,backstory,personality_traits,ideals,bonds,flaws,experience,class_name,level,hp,max_hp,ac,initiative,speed,proficiency,passive_perception,passive_insight,passive_investigation,str,dex,con,int,wis,cha)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(activeCampaignId,'New Adventurer','','','','','','','','',0,'Adventurer',1,10,10,10,0,30,2,10,10,10,10,10,10,10,10,10).lastInsertRowid)
  setSetting(`selected_character_id:${activeCampaignId}`,String(id))
  return getCharacter(id)
}
export function selectCharacter(id: number): CharacterStats {
  const safeId=Math.trunc(num(id,-1))
  if (!db.prepare('SELECT id FROM characters WHERE id=? AND campaign_id=?').get(safeId,activeCampaignId)) throw new Error('Character does not belong to the active campaign')
  setSetting(`selected_character_id:${activeCampaignId}`,String(safeId))
  return getCharacter(safeId)
}
export function deleteCharacter(id: number): boolean {
  const safeId=Math.trunc(num(id,-1))
  const characters=getCharacters()
  if (characters.length<=1) throw new Error('Every campaign must keep at least one character. Create another character before deleting this one.')
  const row=characters.find(character=>character.id===safeId)
  if (!row) throw new Error('Character not found in the active campaign')
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM abilities WHERE campaign_id=? AND character_id=?').run(activeCampaignId,safeId)
    db.prepare('DELETE FROM roll_log WHERE campaign_id=? AND character_id=?').run(activeCampaignId,safeId)
    db.prepare('DELETE FROM characters WHERE id=? AND campaign_id=?').run(safeId,activeCampaignId)
  })
  tx()
  if (selectedCharacterId()===safeId) setSetting(`selected_character_id:${activeCampaignId}`,String(characters.find(c=>c.id!==safeId)!.id))
  return true
}

/** Save ability cards only for the currently selected character. */
export function saveAbilities(inputs: AbilityInput[]): Ability[] {
  if (!Array.isArray(inputs) || inputs.length > 200) throw new Error('You can save up to 200 ability cards')
  const characterId=selectedCharacterId(activeCampaignId)
  const normalized = inputs.map(input => {
    const name = str(input.name, 100).trim()
    if (!name) throw new Error('Every ability card needs a name')
    const kind = (['Attack', 'Ability', 'Spell'] as string[]).includes(input.kind) ? input.kind : 'Ability'
    const formula = str(input.formula || '1d20', 32).replace(/\s+/g, '').toLowerCase()
    if (!/^\d{1,2}d\d{1,3}(?:[+-]\d{1,4})?$/.test(formula)) throw new Error(`Invalid dice formula for ${name}. Use a formula such as 1d20+5.`)
    const dice = formula.match(/^(\d{1,2})d(\d{1,3})/)
    if (!dice || Number(dice[1]) < 1 || Number(dice[1]) > 20 || Number(dice[2]) < 2 || Number(dice[2]) > 1000) throw new Error(`Dice formula for ${name} is outside the supported limits`)
    return { id: input.id, name, kind, formula, detail: str(input.detail, 400), uses: str(input.uses, 400) }
  })
  const savedIds: number[] = []
  const tx = db.transaction(() => {
    const existing = new Set((db.prepare('SELECT id FROM abilities WHERE campaign_id=? AND character_id=?').all(activeCampaignId,characterId) as Array<{id:number}>).map(row => row.id))
    for (const item of normalized) {
      if (item.id !== undefined && existing.has(item.id)) {
        db.prepare('UPDATE abilities SET name=?,kind=?,detail=?,formula=?,uses=? WHERE id=? AND campaign_id=? AND character_id=?').run(item.name,item.kind,item.detail,item.formula,item.uses,item.id,activeCampaignId,characterId)
        savedIds.push(item.id)
      } else {
        const result = db.prepare('INSERT INTO abilities(campaign_id,character_id,name,kind,detail,formula,uses) VALUES(?,?,?,?,?,?,?)').run(activeCampaignId,characterId,item.name,item.kind,item.detail,item.formula,item.uses)
        savedIds.push(Number(result.lastInsertRowid))
      }
    }
    const params=[activeCampaignId,characterId,...savedIds]
    if (savedIds.length) {
      const placeholders = savedIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM abilities WHERE campaign_id=? AND character_id=? AND id NOT IN (${placeholders})`).run(...params)
    } else db.prepare('DELETE FROM abilities WHERE campaign_id=? AND character_id=?').run(activeCampaignId,characterId)
  })
  tx()
  return (db.prepare("SELECT * FROM abilities WHERE campaign_id=? AND character_id=? ORDER BY CASE kind WHEN 'Attack' THEN 0 WHEN 'Ability' THEN 1 ELSE 2 END, name").all(activeCampaignId,characterId) as any[]).map(toAbility)
}

function listCampaignRecords(): Campaign[] {
  return (db.prepare('SELECT * FROM campaigns ORDER BY last_opened_at DESC, updated_at DESC, id DESC').all() as any[]).map(toCampaign)
}
export function getWorkspaceState(): WorkspaceState {
  const campaigns=listCampaignRecords()
  if (!campaigns.some(c=>c.id===activeCampaignId) && campaigns.length) {
    activeCampaignId=campaigns[0].id
    setSetting('active_campaign_id',String(activeCampaignId))
  }
  return { campaigns, activeCampaignId }
}
export function setActiveCampaign(id: number): WorkspaceState {
  const safeId=Math.trunc(num(id,-1))
  if (!db.prepare('SELECT id FROM campaigns WHERE id=?').get(safeId)) throw new Error('Campaign not found')
  activeCampaignId=safeId
  const t=now()
  setSetting('active_campaign_id',String(safeId))
  db.prepare('UPDATE campaigns SET last_opened_at=?,updated_at=updated_at WHERE id=?').run(t,safeId)
  ensureCampaignDefaults(safeId)
  return getWorkspaceState()
}
function normalizeCampaignInput(input: CampaignInput): Omit<CampaignInput,'id'> {
  const name=str(input.name,120).trim()
  if (!name) throw new Error('Campaign name is required')
  const imageData=str(input.imageData,6_000_000)
  if (typeof input.imageData === 'string' && input.imageData.length > 6_000_000) throw new Error('Campaign artwork is too large. Please select a smaller image.')
  if (imageData && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(imageData)) throw new Error('Campaign artwork must be an embedded PNG, JPEG, WebP or GIF image.')
  return { name, description:str(input.description,4_000), setting:str(input.setting,180), ruleset:str(input.ruleset,100).trim()||'D&D 5e', imageData }
}
export function createCampaign(input: CampaignInput): Campaign {
  const safe=normalizeCampaignInput(input); const t=now()
  const id=Number(db.prepare('INSERT INTO campaigns(name,description,setting,ruleset,image_data,created_at,updated_at,last_opened_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(safe.name,safe.description,safe.setting,safe.ruleset,safe.imageData,t,t,t).lastInsertRowid)
  ensureCampaignDefaults(id)
  setActiveCampaign(id)
  return toCampaign(db.prepare('SELECT * FROM campaigns WHERE id=?').get(id))
}
export function updateCampaign(input: CampaignInput): Campaign {
  if (!input.id || !db.prepare('SELECT id FROM campaigns WHERE id=?').get(input.id)) throw new Error('Campaign not found')
  const safe=normalizeCampaignInput(input)
  db.prepare('UPDATE campaigns SET name=?,description=?,setting=?,ruleset=?,image_data=?,updated_at=? WHERE id=?')
    .run(safe.name,safe.description,safe.setting,safe.ruleset,safe.imageData,now(),input.id)
  return toCampaign(db.prepare('SELECT * FROM campaigns WHERE id=?').get(input.id))
}
function snapshotCampaign(campaignId: number): CampaignBackup {
  const rawCampaign=db.prepare('SELECT * FROM campaigns WHERE id=?').get(campaignId) as any
  if (!rawCampaign) throw new Error('Campaign not found')
  const campaign=toCampaign(rawCampaign)
  const notes=(db.prepare('SELECT * FROM notes WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(row=>({id:row.id,title:row.title,content:row.content,kind:row.kind,sessionNumber:row.session_number == null ? null : Number(row.session_number),createdAt:row.created_at,updatedAt:row.updated_at,tags:getTags('note',row.id,campaignId)}))
  const quests=(db.prepare('SELECT * FROM quests WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(row=>({id:row.id,name:row.name,giver:row.giver,status:row.status,rewards:row.rewards,notes:row.notes,tags:getTags('quest',row.id,campaignId),objectives:(db.prepare('SELECT title,done,is_side AS isSide,sort_order AS sortOrder FROM objectives WHERE quest_id=? ORDER BY sort_order,id').all(row.id) as any[]).map(o=>({title:o.title,done:Boolean(o.done),isSide:Boolean(o.isSide),sortOrder:o.sortOrder}))}))
  const npcs=(db.prepare('SELECT * FROM npcs WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(row=>({id:row.id,name:row.name,faction:row.faction,location:row.location,standing:row.standing,notes:row.notes,imageData:row.image_data||'',tags:getTags('npc',row.id,campaignId)}))
  const npcLogs=(db.prepare('SELECT * FROM npc_logs WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(row=>({id:row.id,npcId:row.npc_id,npcName:row.npc_name,title:row.title,content:row.content,createdAt:row.created_at,tags:getTags('npc_log',row.id,campaignId)}))
  const loot=(db.prepare('SELECT * FROM loot_items WHERE campaign_id=? ORDER BY id').all(campaignId) as any[]).map(row=>({id:row.id,name:row.name,kind:row.kind,quantity:row.quantity,description:row.description,valueGp:row.value_gp,tags:getTags('loot',row.id,campaignId)}))
  const characters=getCharacters(campaignId).map(character=>({ ...character, abilities:(db.prepare('SELECT * FROM abilities WHERE campaign_id=? AND character_id=? ORDER BY id').all(campaignId,character.id) as any[]).map(toAbility) }))
  const rolls=(db.prepare('SELECT ability_name AS abilityName,formula,rolls_json AS rollsJson,modifier,total,detail,created_at AS createdAt,character_id AS characterId FROM roll_log WHERE campaign_id=? ORDER BY id').all(campaignId) as any[])
    .map(row=>({abilityName:row.abilityName,formula:row.formula,rolls:JSON.parse(row.rollsJson),modifier:row.modifier,total:row.total,detail:row.detail,createdAt:row.createdAt,characterId:row.characterId}))
  const scratch=(db.prepare('SELECT content FROM campaign_scratch WHERE campaign_id=?').get(campaignId) as {content:string}|undefined)?.content ?? ''
  return { format:'spellbook-and-quill-campaign',version:1,exportedAt:now(),campaign:{name:campaign.name,description:campaign.description,setting:campaign.setting,ruleset:campaign.ruleset,imageData:campaign.imageData},content:{notes,quests,npcs,npcLogs,loot,characters,rolls,currency:getCurrency(campaignId),scratch,scratchTags:getTags('scratch',-campaignId,campaignId)} }
}
export function exportCampaignBackup(campaignId: number): CampaignBackup { return snapshotCampaign(campaignId) }
export function deleteCampaign(campaignId: number): { deleted: boolean; backupPath: string; activeCampaignId: number } {
  const safeId=Math.trunc(num(campaignId,-1))
  const existing=db.prepare('SELECT id,name FROM campaigns WHERE id=?').get(safeId) as {id:number;name:string}|undefined
  if (!existing) throw new Error('Campaign not found')
  const campaigns=listCampaignRecords()
  if (campaigns.length<=1) throw new Error('Create another campaign before deleting the only campaign.')
  const backup=snapshotCampaign(safeId)
  const backupDirectory=join(app.getPath('userData'),'backups')
  mkdirSync(backupDirectory,{recursive:true})
  const safeName=existing.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'campaign'
  const backupPath=join(backupDirectory,`${safeName}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqbackup`)
  writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600})
  const ids=(table:string)=> (db.prepare(`SELECT id FROM ${table} WHERE campaign_id=?`).all(safeId) as Array<{id:number}>).map(row=>row.id)
  const noteIds=ids('notes'),questIds=ids('quests'),npcIds=ids('npcs'),npcLogIds=ids('npc_logs'),lootIds=ids('loot_items')
  const tx=db.transaction(()=>{
    for (const [type,list] of [['note',noteIds],['quest',questIds],['npc',npcIds],['npc_log',npcLogIds],['loot',lootIds]] as Array<[string,number[]]>) {
      if(list.length) db.prepare(`DELETE FROM taggings WHERE entity_type=? AND entity_id IN (${list.map(()=>'?').join(',')})`).run(type,...list)
    }
    db.prepare('DELETE FROM taggings WHERE entity_type=? AND entity_id=?').run('scratch',-safeId)
    db.prepare('DELETE FROM objectives WHERE quest_id IN (SELECT id FROM quests WHERE campaign_id=?)').run(safeId)
    db.prepare('DELETE FROM abilities WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM roll_log WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM notes WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM quests WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM npcs WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM npc_logs WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM loot_items WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM characters WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM campaign_scratch WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM campaign_currency WHERE campaign_id=?').run(safeId)
    db.prepare('DELETE FROM campaigns WHERE id=?').run(safeId)
    db.prepare('DELETE FROM app_settings WHERE key=?').run(`selected_character_id:${safeId}`)
  })
  tx()
  if(activeCampaignId===safeId){
    const next=db.prepare('SELECT id FROM campaigns ORDER BY last_opened_at DESC,updated_at DESC,id DESC LIMIT 1').get() as {id:number}
    activeCampaignId=next.id; setSetting('active_campaign_id',String(activeCampaignId)); ensureCampaignDefaults(activeCampaignId)
  }
  return {deleted:true,backupPath,activeCampaignId}
}

export function importCampaignBackup(value: unknown): Campaign {
  if (!value || typeof value!=='object') throw new Error('This is not a campaign backup file')
  const backup=value as CampaignBackup
  if (backup.format!=='spellbook-and-quill-campaign' || backup.version!==1 || !backup.campaign || !backup.content || typeof backup.content!=='object') throw new Error('Unsupported campaign backup format or version')
  const campaign=createCampaign({...backup.campaign,id:undefined,name:`${str(backup.campaign.name,120).trim()||'Restored Campaign'} (Restored)`})
  const cid=campaign.id; const content=backup.content as any
  const noteMap=new Map<number,number>(),questMap=new Map<number,number>(),npcMap=new Map<number,number>(),charMap=new Map<number,number>()
  const tagTasks:Array<{entityType:EntityType;entityId:number;tags:string[]}>=[]
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM characters WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM abilities WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM notes WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM quests WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM npcs WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM npc_logs WHERE campaign_id=?').run(cid)
    db.prepare('DELETE FROM loot_items WHERE campaign_id=?').run(cid)
    const insertNote=db.prepare('INSERT INTO notes(campaign_id,title,content,kind,session_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    for(const item of (Array.isArray(content.notes)?content.notes:[]) as any[]){const t=now();const sessionNumber = Number.isInteger(item.sessionNumber) && item.sessionNumber > 0 ? item.sessionNumber : null;const id=Number(insertNote.run(cid,str(item.title,180)||'Untitled note',str(item.content),item.kind==='lore'?'lore':item.kind==='scratch'?'scratch':'session',sessionNumber,str(item.createdAt,60)||t,str(item.updatedAt,60)||t).lastInsertRowid);noteMap.set(Number(item.id),id);if(Array.isArray(item.tags))tagTasks.push({entityType:'note',entityId:id,tags:item.tags})}
    const insertQuest=db.prepare('INSERT INTO quests(campaign_id,name,giver,status,rewards,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    const insertObjective=db.prepare('INSERT INTO objectives(quest_id,title,done,is_side,sort_order) VALUES(?,?,?,?,?)')
    for(const item of (Array.isArray(content.quests)?content.quests:[]) as any[]){const t=now();const id=Number(insertQuest.run(cid,str(item.name,180)||'Untitled quest',str(item.giver,180),allowedStatus.has(item.status)?item.status:'In Progress',str(item.rewards),str(item.notes),t,t).lastInsertRowid);questMap.set(Number(item.id),id);for(const [index,obj] of (Array.isArray(item.objectives)?item.objectives:[]).entries())insertObjective.run(id,str(obj.title,300),obj.done?1:0,obj.isSide?1:0,index);if(Array.isArray(item.tags))tagTasks.push({entityType:'quest',entityId:id,tags:item.tags})}
    const insertNpc=db.prepare('INSERT INTO npcs(campaign_id,name,faction,location,standing,notes,image_data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    for(const item of (Array.isArray(content.npcs)?content.npcs:[]) as any[]){const t=now();const npcImage=normalizeNpcImage(item.imageData);const id=Number(insertNpc.run(cid,str(item.name,180)||'Unnamed NPC',str(item.faction,180),str(item.location,180),allowedStanding.has(item.standing)?item.standing:'Neutral',str(item.notes),npcImage,t,t).lastInsertRowid);npcMap.set(Number(item.id),id);if(Array.isArray(item.tags))tagTasks.push({entityType:'npc',entityId:id,tags:item.tags})}
    const insertLog=db.prepare('INSERT INTO npc_logs(campaign_id,npc_id,npc_name,title,content,created_at) VALUES(?,?,?,?,?,?)')
    for(const item of (Array.isArray(content.npcLogs)?content.npcLogs:[]) as any[]){const nid=item.npcId==null?null:(npcMap.get(Number(item.npcId))??null);const id=Number(insertLog.run(cid,nid,str(item.npcName,180),str(item.title,180)||'Untitled log',str(item.content),str(item.createdAt,60)||now()).lastInsertRowid);if(Array.isArray(item.tags))tagTasks.push({entityType:'npc_log',entityId:id,tags:item.tags})}
    const insertLoot=db.prepare('INSERT INTO loot_items(campaign_id,name,kind,quantity,description,value_gp,created_at) VALUES(?,?,?,?,?,?,?)')
    for(const item of (Array.isArray(content.loot)?content.loot:[]) as any[]){const id=Number(insertLoot.run(cid,str(item.name,180)||'Unidentified item',allowedLootKind.has(item.kind)?item.kind:'Item',Math.max(1,Math.floor(num(item.quantity,1))),str(item.description),Math.max(0,num(item.valueGp)),str(item.createdAt,60)||now()).lastInsertRowid);if(Array.isArray(item.tags))tagTasks.push({entityType:'loot',entityId:id,tags:item.tags})}
    const chars=Array.isArray(content.characters)?content.characters:[]
    const insertCharacter=db.prepare(`INSERT INTO characters(campaign_id,name,species,background,alignment,backstory,personality_traits,ideals,bonds,flaws,experience,class_name,level,hp,max_hp,ac,initiative,speed,proficiency,passive_perception,passive_insight,passive_investigation,str,dex,con,int,wis,cha)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    for(const item of chars as any[]){const id=Number(insertCharacter.run(cid,str(item.name,100)||'Adventurer',str(item.species,100),str(item.background,160),str(item.alignment,80),str(item.backstory,50_000),str(item.personalityTraits,4_000),str(item.ideals,4_000),str(item.bonds,4_000),str(item.flaws,4_000),Math.max(0,Math.trunc(num(item.experience))),str(item.className,100)||'Adventurer',Math.max(1,Math.min(20,Math.trunc(num(item.level,1)))),Math.max(0,Math.trunc(num(item.hp))),Math.max(1,Math.trunc(num(item.maxHp,1))),Math.max(0,Math.trunc(num(item.ac))),Math.trunc(num(item.initiative)),Math.max(0,Math.trunc(num(item.speed,30))),Math.trunc(num(item.proficiency,2)),Math.trunc(num(item.passivePerception,10)),Math.trunc(num(item.passiveInsight,10)),Math.trunc(num(item.passiveInvestigation,10)),...['str','dex','con','int','wis','cha'].map(k=>Math.max(1,Math.min(40,Math.trunc(num(item[k],10)))))).lastInsertRowid);charMap.set(Number(item.id),id)}
    if(!chars.length){ensureCampaignDefaults(cid)}
    const insertAbility=db.prepare('INSERT INTO abilities(campaign_id,character_id,name,kind,detail,formula,uses) VALUES(?,?,?,?,?,?,?)')
    for(const item of chars as any[]){const characterId=charMap.get(Number(item.id));if(!characterId)continue;for(const ability of (Array.isArray(item.abilities)?item.abilities:[]) as any[]){const formula=str(ability.formula||'1d20',32);insertAbility.run(cid,characterId,str(ability.name,100)||'Ability',(['Spell','Attack','Ability'] as string[]).includes(ability.kind)?ability.kind:'Ability',str(ability.detail,400),/^\d{1,2}d\d{1,3}(?:[+-]\d{1,4})?$/.test(formula)?formula:'1d20',str(ability.uses,400))}}
    for(const item of (Array.isArray(content.rolls)?content.rolls:[]) as any[]){const characterId=charMap.get(Number(item.characterId))??null;db.prepare('INSERT INTO roll_log(campaign_id,character_id,ability_name,formula,rolls_json,modifier,total,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(cid,characterId,str(item.abilityName,100),str(item.formula,32),JSON.stringify(Array.isArray(item.rolls)?item.rolls:[]),Math.trunc(num(item.modifier)),Math.trunc(num(item.total)),str(item.detail,800),str(item.createdAt,60)||now())}
    const currency=(content.currency||{}) as Currency
    db.prepare('UPDATE campaign_currency SET pp=?,gp=?,sp=?,cp=?,updated_at=? WHERE campaign_id=?').run(Math.max(0,Math.trunc(num(currency.pp))),Math.max(0,Math.trunc(num(currency.gp))),Math.max(0,Math.trunc(num(currency.sp))),Math.max(0,Math.trunc(num(currency.cp))),now(),cid)
    db.prepare('UPDATE campaign_scratch SET content=?,updated_at=? WHERE campaign_id=?').run(str(content.scratch,16_000),now(),cid)
  })
  tx()
  for(const task of tagTasks)addTags({...task,campaignId:cid})
  if(Array.isArray(content.scratchTags)&&content.scratchTags.length)addTags({entityType:'scratch',entityId:-cid,campaignId:cid,tags:content.scratchTags})
  const first=db.prepare('SELECT id FROM characters WHERE campaign_id=? ORDER BY id LIMIT 1').get(cid) as {id:number}|undefined
  if(first)setSetting(`selected_character_id:${cid}`,String(first.id))
  ensureCampaignDefaults(cid)
  db.flush()
  return currentCampaign()
}

export async function initDatabase(): Promise<void> {
  const filename = join(app.getPath('userData'), 'spellbook-and-quill.sqlite')
  mkdirSync(dirname(filename), { recursive: true })

  // In development the dependency lives under the project; in packaged builds
  // it is included under app.asar/node_modules by electron-builder.
  const wasmDirectory = join(app.getAppPath(), 'node_modules', 'sql.js', 'dist')
  const SQL = await initSqlJs({ locateFile: (file: string) => join(wasmDirectory, file) })
  const raw = existsSync(filename)
    ? new SQL.Database(new Uint8Array(readFileSync(filename)))
    : new SQL.Database()

  db = new SqlJsDatabaseAdapter(raw, filename)
  schema()
  // Persist a new database (including schema and sample records) right away.
  db.flush()
}

export function getDashboard(): DashboardData {
  ensureCampaignDefaults(activeCampaignId)
  const campaign=currentCampaign()
  const cid=activeCampaignId
  const notes = (db.prepare('SELECT * FROM notes WHERE campaign_id=? ORDER BY updated_at DESC').all(cid) as any[]).map(toNote)
  const quests = (db.prepare(`SELECT * FROM quests WHERE campaign_id=? ORDER BY CASE status WHEN 'In Progress' THEN 0 WHEN 'On Hold' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END, updated_at DESC`).all(cid) as any[]).map(toQuest)
  const npcs = (db.prepare('SELECT * FROM npcs WHERE campaign_id=? ORDER BY name COLLATE NOCASE').all(cid) as any[]).map(toNpc)
  const npcLogs = (db.prepare('SELECT * FROM npc_logs WHERE campaign_id=? ORDER BY created_at DESC LIMIT 100').all(cid) as any[]).map(toNpcLog)
  const loot = (db.prepare('SELECT * FROM loot_items WHERE campaign_id=? ORDER BY created_at DESC').all(cid) as any[]).map(toLoot)
  const characters=getCharacters(cid)
  const character=getCharacter(selectedCharacterId(cid))
  const abilities = (db.prepare("SELECT * FROM abilities WHERE campaign_id=? AND character_id=? ORDER BY CASE kind WHEN 'Attack' THEN 0 WHEN 'Ability' THEN 1 ELSE 2 END, name").all(cid,character.id) as any[]).map(toAbility)
  const rolls = (db.prepare('SELECT * FROM roll_log WHERE campaign_id=? AND (character_id=? OR character_id IS NULL) ORDER BY created_at DESC LIMIT 30').all(cid,character.id) as any[]).map(toRoll)
  const scratch = (db.prepare('SELECT content FROM campaign_scratch WHERE campaign_id=?').get(cid) as { content: string }).content
  return { campaign, characters, notes, quests, npcs, npcLogs, loot, currency: getCurrency(cid), abilities, character, rolls, scratch }
}

export function saveNote(input: NoteInput): Note {
  const title = str(input.title, 180).trim() || 'Untitled note'
  const content = str(input.content)
  const kind = input.kind === 'lore' ? 'lore' : input.kind === 'scratch' ? 'scratch' : 'session'
  const rawSessionNumber = input.sessionNumber
  const safeSessionNumber = rawSessionNumber == null || !Number.isFinite(Number(rawSessionNumber)) || Number(rawSessionNumber) < 1
    ? null
    : Math.floor(Number(rawSessionNumber))
  const t = now(); let id = input.id
  if (id && db.prepare('SELECT id FROM notes WHERE id=? AND campaign_id=?').get(id,activeCampaignId)) db.prepare('UPDATE notes SET title=?,content=?,kind=?,session_number=?,updated_at=? WHERE id=? AND campaign_id=?').run(title,content,kind,safeSessionNumber,t,id,activeCampaignId)
  else id = Number(db.prepare('INSERT INTO notes(campaign_id,title,content,kind,session_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(activeCampaignId,title,content,kind,safeSessionNumber,t,t).lastInsertRowid)
  return toNote(db.prepare('SELECT * FROM notes WHERE id=? AND campaign_id=?').get(id,activeCampaignId))
}
export function deleteNote(id: number) { const safe=num(id); db.prepare("DELETE FROM taggings WHERE entity_type='note' AND entity_id=?").run(safe); db.prepare('DELETE FROM notes WHERE id=? AND campaign_id=?').run(safe,activeCampaignId); return true }

export function saveQuest(input: QuestInput): Quest {
  const name = str(input.name, 180).trim()
  if (!name) throw new Error('Quest name is required')
  const giver = str(input.giver,180), rewards=str(input.rewards), notes=str(input.notes)
  const status=allowedStatus.has(input.status)?input.status:'In Progress'; const t=now(); const requestedId=input.id; const cid=activeCampaignId
  const tx=db.transaction(()=>{
    let questId:number
    if (requestedId!==undefined && db.prepare('SELECT id FROM quests WHERE id=? AND campaign_id=?').get(requestedId,cid)) {
      questId=requestedId
      db.prepare('UPDATE quests SET name=?,giver=?,status=?,rewards=?,notes=?,updated_at=? WHERE id=? AND campaign_id=?').run(name,giver,status,rewards,notes,t,questId,cid)
    } else questId=Number(db.prepare('INSERT INTO quests(campaign_id,name,giver,status,rewards,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(cid,name,giver,status,rewards,notes,t,t).lastInsertRowid)
    db.prepare('DELETE FROM objectives WHERE quest_id=?').run(questId)
    const insert=db.prepare('INSERT INTO objectives(quest_id,title,done,is_side,sort_order) VALUES(?,?,?,?,?)')
    input.objectives.slice(0,100).filter(o=>str(o.title,300).trim()).forEach((o,index)=>insert.run(questId,str(o.title,300).trim(),o.done?1:0,o.isSide?1:0,index))
    return questId
  })
  const questId=tx()
  return toQuest(db.prepare('SELECT * FROM quests WHERE id=? AND campaign_id=?').get(questId,cid))
}
export function deleteQuest(id: number) { const safe=num(id); db.prepare("DELETE FROM taggings WHERE entity_type='quest' AND entity_id=?").run(safe); db.prepare('DELETE FROM quests WHERE id=? AND campaign_id=?').run(safe,activeCampaignId); return true }

function normalizeNpcImage(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  if (value.length > 2_500_000) throw new Error('NPC portrait is too large. Please choose a smaller image.')
  if (!/^data:image\/(jpeg|png|webp);base64,/i.test(value)) throw new Error('NPC portraits must be embedded JPEG, PNG or WebP images.')
  return value
}

export function saveNpc(input: NpcInput): Npc {
  const name=str(input.name,180).trim(); if(!name) throw new Error('NPC name is required')
  const faction=str(input.faction,180), location=str(input.location,180), notes=str(input.notes)
  const imageData=normalizeNpcImage(input.imageData)
  const standing=allowedStanding.has(input.standing)?input.standing:'Neutral'; const t=now(); let id=input.id; const cid=activeCampaignId
  if(id && db.prepare('SELECT id FROM npcs WHERE id=? AND campaign_id=?').get(id,cid)) db.prepare('UPDATE npcs SET name=?,faction=?,location=?,standing=?,notes=?,image_data=?,updated_at=? WHERE id=? AND campaign_id=?').run(name,faction,location,standing,notes,imageData,t,id,cid)
  else id=Number(db.prepare('INSERT INTO npcs(campaign_id,name,faction,location,standing,notes,image_data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(cid,name,faction,location,standing,notes,imageData,t,t).lastInsertRowid)
  return toNpc(db.prepare('SELECT * FROM npcs WHERE id=? AND campaign_id=?').get(id,cid))
}
export function deleteNpc(id: number) { const safe=num(id); db.prepare("DELETE FROM taggings WHERE entity_type='npc' AND entity_id=?").run(safe); db.prepare('DELETE FROM npcs WHERE id=? AND campaign_id=?').run(safe,activeCampaignId); return true }
export function saveNpcLog(input: NpcLogInput): NpcLog {
  const title=str(input.title,180).trim()||'Untitled log'
  const content=str(input.content)
  const npcName=str(input.npcName,180)
  const cid=activeCampaignId
  const npcId=input.npcId && db.prepare('SELECT id FROM npcs WHERE id=? AND campaign_id=?').get(input.npcId,cid) ? input.npcId : null
  let id: number
  if (input.id !== undefined) {
    const existing=db.prepare('SELECT id FROM npc_logs WHERE id=? AND campaign_id=?').get(num(input.id,-1),cid)
    if (!existing) throw new Error('Conversation entry not found in the active campaign')
    db.prepare('UPDATE npc_logs SET npc_id=?,npc_name=?,title=?,content=? WHERE id=? AND campaign_id=?').run(npcId,npcName,title,content,input.id,cid)
    id=input.id
  } else {
    id=Number(db.prepare('INSERT INTO npc_logs(campaign_id,npc_id,npc_name,title,content,created_at) VALUES(?,?,?,?,?,?)').run(cid,npcId,npcName,title,content,now()).lastInsertRowid)
  }
  return toNpcLog(db.prepare('SELECT * FROM npc_logs WHERE id=? AND campaign_id=?').get(id,cid))
}
export function saveScratch(content: string) {
  const value=str(content,16_000)
  db.prepare('INSERT INTO campaign_scratch(campaign_id,content,updated_at) VALUES(?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at').run(activeCampaignId,value,now())
  return value
}
export function saveCurrency(currency: Currency): Currency {
  const safe:Currency={pp:Math.max(0,Math.floor(num(currency.pp))),gp:Math.max(0,Math.floor(num(currency.gp))),sp:Math.max(0,Math.floor(num(currency.sp))),cp:Math.max(0,Math.floor(num(currency.cp)))}
  db.prepare('INSERT INTO campaign_currency(campaign_id,pp,gp,sp,cp,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET pp=excluded.pp,gp=excluded.gp,sp=excluded.sp,cp=excluded.cp,updated_at=excluded.updated_at').run(activeCampaignId,safe.pp,safe.gp,safe.sp,safe.cp,now())
  return safe
}
export function saveLoot(input: LootInput): LootItem {
  const name=str(input.name,180).trim()
  if(!name) throw new Error('Item name is required')
  const kind=allowedLootKind.has(input.kind)?input.kind:'Item'
  const quantity=Math.max(1,Math.min(999_999,Math.floor(num(input.quantity,1))))
  const description=str(input.description,100_000)
  const valueGp=Math.max(0,Math.min(1_000_000_000,num(input.valueGp)))
  const cid=activeCampaignId
  let id:number
  if(input.id!==undefined){
    const existing=db.prepare('SELECT id FROM loot_items WHERE id=? AND campaign_id=?').get(num(input.id,-1),cid)
    if(!existing) throw new Error('Loot item not found in the active campaign')
    db.prepare('UPDATE loot_items SET name=?,kind=?,quantity=?,description=?,value_gp=? WHERE id=? AND campaign_id=?').run(name,kind,quantity,description,valueGp,input.id,cid)
    id=input.id
  } else {
    id=Number(db.prepare('INSERT INTO loot_items(campaign_id,name,kind,quantity,description,value_gp,created_at) VALUES(?,?,?,?,?,?,?)').run(cid,name,kind,quantity,description,valueGp,now()).lastInsertRowid)
  }
  return toLoot(db.prepare('SELECT * FROM loot_items WHERE id=? AND campaign_id=?').get(id,cid))
}
export function addLoot(input: LootInput): LootItem { return saveLoot({ ...input, id: undefined }) }
export function deleteLoot(id: number) { const safe=num(id); db.prepare("DELETE FROM taggings WHERE entity_type='loot' AND entity_id=?").run(safe); db.prepare('DELETE FROM loot_items WHERE id=? AND campaign_id=?').run(safe,activeCampaignId); return true }
export function saveTags(input: TagInput) { addTags(input); return getTags(input.entityType, input.entityType==='scratch' ? - (input.campaignId ?? activeCampaignId) : input.entityId, input.campaignId ?? activeCampaignId) }

function searchSnippet(value: string, query: string): string {
  const text = plainText(value)
  if (!text) return ''
  if (!query) return text.slice(0, 180)
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (at < 0) return text.slice(0, 180)
  const sentenceStart = Math.max(text.lastIndexOf('.', at), text.lastIndexOf('!', at), text.lastIndexOf('?', at), text.lastIndexOf('\n', at)) + 1
  let sentenceEnd = text.length
  for (const mark of ['.', '!', '?', '\n']) { const found = text.indexOf(mark, at + query.length); if (found >= 0) sentenceEnd = Math.min(sentenceEnd, found + 1) }
  let snippet = text.slice(sentenceStart, sentenceEnd).trim()
  if (snippet.length > 220) {
    const begin = Math.max(0, at - sentenceStart - 70)
    snippet = `${begin ? '…' : ''}${text.slice(sentenceStart + begin, Math.min(sentenceEnd, sentenceStart + begin + 180)).trim()}${sentenceStart + begin + 180 < sentenceEnd ? '…' : ''}`
  }
  return snippet || text.slice(Math.max(0, at - 70), at + query.length + 100)
}

export function searchAll(query: string, allCampaigns = false): SearchResult[] {
  const raw = str(query, 200).trim()
  if (!raw) return []
  const tagQuery = raw.match(/^\[([^\]]{1,64})\]$/u)?.[1]?.trim()
  const q = tagQuery || raw
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const results: SearchResult[] = []
  const scope = allCampaigns ? '' : ' AND x.campaign_id=?'
  const params = (...items: any[]) => allCampaigns ? items : [...items, activeCampaignId]
  const push = (item: Omit<SearchResult, 'tags'|'entityType'|'campaignId'|'campaignName'>, type: EntityType, cid: number, campaignName: string) => results.push({ ...item, entityType: type, tags: getTags(type, item.id, cid), campaignId: cid, campaignName })
  const append = (sql: string, values: any[], type: EntityType, titleKey = 'title', bodyKey = 'body') => {
    const rows = db.prepare(sql).all(...values) as any[]
    for (const r of rows) {
      const body = plainText(r[bodyKey] || '')
      const titleMatch = String(r[titleKey] || '').toLocaleLowerCase().includes(q.toLocaleLowerCase())
      push({ id: r.id, title: r[titleKey], excerpt: searchSnippet(body, q), updatedAt: r.ts, meta: r.meta, matchTerm: titleMatch && !body.toLocaleLowerCase().includes(q.toLocaleLowerCase()) ? undefined : q, matchKind: 'text' }, type, r.campaign_id, r.campaign_name)
    }
  }
  if (!tagQuery) {
    append(`SELECT x.id,x.title,x.content AS body,x.updated_at AS ts,x.campaign_id,c.name AS campaign_name FROM notes x JOIN campaigns c ON c.id=x.campaign_id WHERE (x.title LIKE ? ESCAPE '\\' OR x.content LIKE ? ESCAPE '\\')${scope}`, params(pattern, pattern), 'note')
    append(`SELECT x.id,x.name AS title,x.notes AS body,x.updated_at AS ts,x.status AS meta,x.campaign_id,c.name AS campaign_name FROM quests x JOIN campaigns c ON c.id=x.campaign_id WHERE (x.name LIKE ? ESCAPE '\\' OR x.giver LIKE ? ESCAPE '\\' OR x.notes LIKE ? ESCAPE '\\' OR x.rewards LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM objectives o WHERE o.quest_id=x.id AND o.title LIKE ? ESCAPE '\\'))${scope}`, params(pattern,pattern,pattern,pattern,pattern), 'quest')
    const scratchRows = db.prepare(`SELECT -s.campaign_id AS id,s.content AS body,s.updated_at AS ts,s.campaign_id,c.name AS campaign_name FROM campaign_scratch s JOIN campaigns c ON c.id=s.campaign_id WHERE s.content LIKE ? ESCAPE '\\'${allCampaigns?'':' AND s.campaign_id=?'}`).all(...(allCampaigns?[pattern]:[pattern,activeCampaignId])) as any[]
    for (const r of scratchRows) push({ id:r.id,title:'Scratch Pad',excerpt:searchSnippet(r.body,q),updatedAt:r.ts,matchTerm:q,matchKind:'text' },'scratch',r.campaign_id,r.campaign_name)
    append(`SELECT x.id,x.name AS title,x.notes AS body,x.updated_at AS ts,x.faction AS meta,x.campaign_id,c.name AS campaign_name FROM npcs x JOIN campaigns c ON c.id=x.campaign_id WHERE (x.name LIKE ? ESCAPE '\\' OR x.faction LIKE ? ESCAPE '\\' OR x.location LIKE ? ESCAPE '\\' OR x.notes LIKE ? ESCAPE '\\')${scope}`, params(pattern,pattern,pattern,pattern), 'npc')
    append(`SELECT x.id,x.title,x.content AS body,x.created_at AS ts,x.npc_name AS meta,x.campaign_id,c.name AS campaign_name FROM npc_logs x JOIN campaigns c ON c.id=x.campaign_id WHERE (x.title LIKE ? ESCAPE '\\' OR x.content LIKE ? ESCAPE '\\' OR x.npc_name LIKE ? ESCAPE '\\')${scope}`, params(pattern,pattern,pattern), 'npc_log')
    append(`SELECT x.id,x.name AS title,x.description AS body,x.created_at AS ts,x.kind AS meta,x.campaign_id,c.name AS campaign_name FROM loot_items x JOIN campaigns c ON c.id=x.campaign_id WHERE (x.name LIKE ? ESCAPE '\\' OR x.description LIKE ? ESCAPE '\\')${scope}`, params(pattern,pattern), 'loot')
  }
  const taggedSql = tagQuery
    ? 'SELECT entity_type,entity_id FROM taggings JOIN tags ON tags.id=taggings.tag_id WHERE tags.name=? COLLATE NOCASE'
    : `SELECT entity_type,entity_id FROM taggings JOIN tags ON tags.id=taggings.tag_id WHERE tags.name LIKE ? ESCAPE '\\'`
  const tagged = db.prepare(taggedSql).all(tagQuery ? q : pattern) as any[]
  for (const row of tagged) {
    if (!allowedEntityTypes.has(row.entity_type)) continue
    const result = lookupSearchEntity(row.entity_type as EntityType, Number(row.entity_id), allCampaigns ? undefined : activeCampaignId)
    if (!result || (!tagQuery && !result.tags.some(tag => tag.toLocaleLowerCase().includes(q.toLocaleLowerCase())))) continue
    const existing = results.find(item => item.entityType===result.entityType && item.id===result.id && item.campaignId===result.campaignId)
    if (existing) existing.matchKind = 'both'
    else results.push({ ...result, matchTerm: undefined, matchKind: 'tag' })
  }
  const seen = new Set<string>()
  return results.filter(result => { const key=`${result.campaignId}:${result.entityType}:${result.id}`; if(seen.has(key))return false;seen.add(key);return true }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,250)
}

export function getRelatedTags(tagName: string, allCampaigns = false): Array<{name:string;count:number}> {
  const name = str(tagName, 64).trim().replace(/^\[|\]$/g, '')
  if (!name) return []
  const campaignClause = allCampaigns ? '' : ' AND e.campaign_id=?'
  const campaignParams = allCampaigns ? [] : [activeCampaignId]
  const rows = db.prepare(`SELECT related.name AS name, COUNT(DISTINCT source.entity_type || ':' || source.entity_id) AS count
    FROM taggings source JOIN tags target ON target.id=source.tag_id
    JOIN taggings related_link ON related_link.entity_type=source.entity_type AND related_link.entity_id=source.entity_id AND related_link.tag_id<>source.tag_id
    JOIN tags related ON related.id=related_link.tag_id
    JOIN (SELECT 'note' AS entity_type,id,campaign_id FROM notes UNION ALL SELECT 'quest',id,campaign_id FROM quests UNION ALL SELECT 'npc',id,campaign_id FROM npcs UNION ALL SELECT 'npc_log',id,campaign_id FROM npc_logs UNION ALL SELECT 'loot',id,campaign_id FROM loot_items UNION ALL SELECT 'scratch',-campaign_id,campaign_id FROM campaign_scratch) e ON e.entity_type=source.entity_type AND e.id=source.entity_id
    WHERE target.name=? COLLATE NOCASE${campaignClause} GROUP BY related.id ORDER BY count DESC, related.name COLLATE NOCASE LIMIT 12`).all(name, ...campaignParams) as Array<{name:string;count:number}>
  return rows
}
function lookupSearchEntity(type:EntityType,id:number,campaignId?:number):SearchResult|null{
  const tagId=type==='scratch'?id:id
  let r:any
  if(type==='scratch'){
    const cid=campaignId ?? -id
    if(id!==-cid)return null
    r=db.prepare('SELECT s.content AS body,s.updated_at AS ts,s.campaign_id,c.name AS campaign_name FROM campaign_scratch s JOIN campaigns c ON c.id=s.campaign_id WHERE s.campaign_id=?').get(cid)
    if(r)return {entityType:type,id:tagId,title:'Scratch Pad',excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,tagId,cid),campaignId:cid,campaignName:r.campaign_name}
    return null
  }
  const filter=campaignId===undefined?'':' AND x.campaign_id=?'
  const args=campaignId===undefined?[id]:[id,campaignId]
  const select=(sql:string)=>db.prepare(sql.replace('SELECT ', 'SELECT x.campaign_id,c.name AS campaign_name, ')).get(...args)
  if(type==='note'){r=select(`SELECT x.id,x.title,x.content AS body,x.updated_at AS ts FROM notes x JOIN campaigns c ON c.id=x.campaign_id WHERE x.id=?${filter}`);if(r)return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id,r.campaign_id),campaignId:r.campaign_id,campaignName:r.campaign_name}}
  if(type==='quest'){r=select(`SELECT x.id,x.name AS title,x.notes AS body,x.updated_at AS ts,x.status AS meta FROM quests x JOIN campaigns c ON c.id=x.campaign_id WHERE x.id=?${filter}`);if(r)return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id,r.campaign_id),meta:r.meta,campaignId:r.campaign_id,campaignName:r.campaign_name}}
  if(type==='npc'){r=select(`SELECT x.id,x.name AS title,x.notes AS body,x.updated_at AS ts,x.faction AS meta FROM npcs x JOIN campaigns c ON c.id=x.campaign_id WHERE x.id=?${filter}`);if(r)return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id,r.campaign_id),meta:r.meta,campaignId:r.campaign_id,campaignName:r.campaign_name}}
  if(type==='npc_log'){r=select(`SELECT x.id,x.title,x.content AS body,x.created_at AS ts,x.npc_name AS meta FROM npc_logs x JOIN campaigns c ON c.id=x.campaign_id WHERE x.id=?${filter}`);if(r)return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id,r.campaign_id),meta:r.meta,campaignId:r.campaign_id,campaignName:r.campaign_name}}
  if(type==='loot'){r=select(`SELECT x.id,x.name AS title,x.description AS body,x.created_at AS ts,x.kind AS meta FROM loot_items x JOIN campaigns c ON c.id=x.campaign_id WHERE x.id=?${filter}`);if(r)return {entityType:type,id,title:r.title,excerpt:plainText(r.body).slice(0,180),updatedAt:r.ts,tags:getTags(type,id,r.campaign_id),meta:r.meta,campaignId:r.campaign_id,campaignName:r.campaign_name}}
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
  const characterId=selectedCharacterId(activeCampaignId)
  const row=db.prepare('SELECT * FROM abilities WHERE id=? AND campaign_id=? AND character_id=?').get(num(abilityId),activeCampaignId,characterId) as any
  if(!row)throw new Error('Ability not found for the selected character')
  const result=rollDice(row.formula);const detail=`${row.detail}${row.uses?` · ${row.uses}`:''}`
  const id=Number(db.prepare('INSERT INTO roll_log(campaign_id,character_id,ability_name,formula,rolls_json,modifier,total,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(activeCampaignId,characterId,row.name,result.formula,JSON.stringify(result.rolls),result.modifier,result.total,detail,now()).lastInsertRowid)
  return toRoll(db.prepare('SELECT * FROM roll_log WHERE id=?').get(id))
}
export function closeDatabase() { if (db?.open) db.close() }
