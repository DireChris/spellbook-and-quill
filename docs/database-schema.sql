-- Spellbook & Quill - local SQLite schema
-- The runtime enables foreign keys. sql.js persists by exporting an in-memory database to this file.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT 'Untitled note',
  content TEXT NOT NULL DEFAULT '', -- Tiptap HTML
  kind TEXT NOT NULL DEFAULT 'session' CHECK(kind IN ('session','lore','scratch')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  giver TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'In Progress' CHECK(status IN ('In Progress','Completed','Failed','On Hold')),
  rewards TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quests_updated ON quests(updated_at DESC);

CREATE TABLE IF NOT EXISTS objectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  is_side INTEGER NOT NULL DEFAULT 0 CHECK(is_side IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS npcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  faction TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  standing TEXT NOT NULL DEFAULT 'Neutral' CHECK(standing IN ('Friendly','Neutral','Hostile')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_npcs_name ON npcs(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS npc_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
  npc_name TEXT NOT NULL DEFAULT '', -- preserves searchable history after NPC deletion
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scratch_pad (
  id INTEGER PRIMARY KEY CHECK(id=1),
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_currency (
  id INTEGER PRIMARY KEY CHECK(id=1),
  pp INTEGER NOT NULL DEFAULT 0 CHECK(pp>=0),
  gp INTEGER NOT NULL DEFAULT 0 CHECK(gp>=0),
  sp INTEGER NOT NULL DEFAULT 0 CHECK(sp>=0),
  cp INTEGER NOT NULL DEFAULT 0 CHECK(cp>=0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Item' CHECK(kind IN ('Item','Magic Item','Weapon','Armour','Other')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1),
  description TEXT NOT NULL DEFAULT '',
  value_gp REAL NOT NULL DEFAULT 0 CHECK(value_gp>=0),
  created_at TEXT NOT NULL
);

-- Tags are shared across all searchable entity types. taggings is a polymorphic link.
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS taggings (
  entity_type TEXT NOT NULL CHECK(entity_type IN ('note','quest','scratch','npc','npc_log','loot')),
  entity_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(entity_type, entity_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_taggings_entity ON taggings(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT 'Adventurer',
  level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),
  hp INTEGER NOT NULL DEFAULT 24,
  max_hp INTEGER NOT NULL DEFAULT 24 CHECK(max_hp>=1),
  ac INTEGER NOT NULL DEFAULT 15,
  initiative INTEGER NOT NULL DEFAULT 2,
  speed INTEGER NOT NULL DEFAULT 30,
  proficiency INTEGER NOT NULL DEFAULT 2,
  passive_perception INTEGER NOT NULL DEFAULT 14,
  passive_insight INTEGER NOT NULL DEFAULT 12,
  passive_investigation INTEGER NOT NULL DEFAULT 11,
  str INTEGER NOT NULL DEFAULT 10,
  dex INTEGER NOT NULL DEFAULT 14,
  con INTEGER NOT NULL DEFAULT 12,
  int INTEGER NOT NULL DEFAULT 13,
  wis INTEGER NOT NULL DEFAULT 16,
  cha INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Ability' CHECK(kind IN ('Spell','Ability','Attack')),
  detail TEXT NOT NULL DEFAULT '',
  formula TEXT NOT NULL DEFAULT '1d20',
  uses TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS roll_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ability_name TEXT NOT NULL,
  formula TEXT NOT NULL,
  rolls_json TEXT NOT NULL DEFAULT '[]',
  modifier INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO scratch_pad(id, content, updated_at) VALUES (1, '', CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO party_currency(id, pp, gp, sp, cp, updated_at) VALUES (1, 0, 0, 0, 0, CURRENT_TIMESTAMP);
