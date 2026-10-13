-- Spellbook & Quill multi-campaign SQLite schema (sql.js / SQLite).
-- Runtime migrations in src/main/database.ts add these campaign columns to legacy tables in place.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  setting TEXT NOT NULL DEFAULT '',
  ruleset TEXT NOT NULL DEFAULT 'D&D 5e',
  image_data TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO campaigns(id,name,description,setting,ruleset,image_data,created_at,updated_at,last_opened_at)
VALUES(1,'My First Campaign','','','D&D 5e','',datetime('now'),datetime('now'),datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value) VALUES('active_campaign_id','1');

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'Untitled note',
  content TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'session' CHECK(kind IN ('session','lore','scratch')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_campaign_updated ON notes(campaign_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  giver TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'In Progress' CHECK(status IN ('In Progress','Completed','Failed','On Hold')),
  rewards TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quests_campaign_updated ON quests(campaign_id, updated_at DESC);
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
  campaign_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL, faction TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
  standing TEXT NOT NULL DEFAULT 'Neutral' CHECK(standing IN ('Friendly','Neutral','Hostile')),
  notes TEXT NOT NULL DEFAULT '', image_data TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign_name ON npcs(campaign_id, name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS npc_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  npc_id INTEGER REFERENCES npcs(id) ON DELETE SET NULL,
  npc_name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scratch_pad (
  id INTEGER PRIMARY KEY CHECK(id=1), content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS party_currency (
  id INTEGER PRIMARY KEY CHECK(id=1), pp INTEGER NOT NULL DEFAULT 0 CHECK(pp>=0), gp INTEGER NOT NULL DEFAULT 0 CHECK(gp>=0),
  sp INTEGER NOT NULL DEFAULT 0 CHECK(sp>=0), cp INTEGER NOT NULL DEFAULT 0 CHECK(cp>=0), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_scratch (
  campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_currency (
  campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  pp INTEGER NOT NULL DEFAULT 0, gp INTEGER NOT NULL DEFAULT 0, sp INTEGER NOT NULL DEFAULT 0, cp INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loot_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Item' CHECK(kind IN ('Item','Magic Item','Weapon','Armour','Other')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1), description TEXT NOT NULL DEFAULT '',
  value_gp REAL NOT NULL DEFAULT 0 CHECK(value_gp>=0), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE
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
  campaign_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  species TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT '', alignment TEXT NOT NULL DEFAULT '',
  backstory TEXT NOT NULL DEFAULT '', personality_traits TEXT NOT NULL DEFAULT '', ideals TEXT NOT NULL DEFAULT '', bonds TEXT NOT NULL DEFAULT '', flaws TEXT NOT NULL DEFAULT '',
  experience INTEGER NOT NULL DEFAULT 0, class_name TEXT NOT NULL DEFAULT 'Adventurer', level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 20),
  hp INTEGER NOT NULL DEFAULT 24, max_hp INTEGER NOT NULL DEFAULT 24 CHECK(max_hp>=1), ac INTEGER NOT NULL DEFAULT 15,
  initiative INTEGER NOT NULL DEFAULT 2, speed INTEGER NOT NULL DEFAULT 30, proficiency INTEGER NOT NULL DEFAULT 2,
  passive_perception INTEGER NOT NULL DEFAULT 14, passive_insight INTEGER NOT NULL DEFAULT 12, passive_investigation INTEGER NOT NULL DEFAULT 11,
  str INTEGER NOT NULL DEFAULT 10, dex INTEGER NOT NULL DEFAULT 14, con INTEGER NOT NULL DEFAULT 12, int INTEGER NOT NULL DEFAULT 13, wis INTEGER NOT NULL DEFAULT 16, cha INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  character_id INTEGER,
  name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'Ability' CHECK(kind IN ('Spell','Ability','Attack')),
  detail TEXT NOT NULL DEFAULT '', formula TEXT NOT NULL DEFAULT '1d20', uses TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS roll_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL DEFAULT 1,
  character_id INTEGER,
  ability_name TEXT NOT NULL, formula TEXT NOT NULL, rolls_json TEXT NOT NULL DEFAULT '[]',
  modifier INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
