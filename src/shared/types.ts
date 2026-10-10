export type EntityType = 'note' | 'quest' | 'scratch' | 'npc' | 'npc_log' | 'loot'
export type NoteKind = 'session' | 'lore' | 'scratch'
export type QuestStatus = 'In Progress' | 'Completed' | 'Failed' | 'On Hold'
export type Standing = 'Friendly' | 'Neutral' | 'Hostile'
export type LootKind = 'Item' | 'Magic Item' | 'Weapon' | 'Armour' | 'Other'

export interface Taggable { id: number; tags: string[] }
export interface Note extends Taggable {
  title: string
  content: string
  kind: NoteKind
  createdAt: string
  updatedAt: string
}
export interface Objective { id: number; questId: number; title: string; done: boolean; isSide: boolean; sortOrder: number }
export interface Quest extends Taggable {
  id: number; name: string; giver: string; status: QuestStatus; rewards: string; notes: string;
  objectives: Objective[]; createdAt: string; updatedAt: string
}
export interface Npc extends Taggable {
  id: number; name: string; faction: string; location: string; standing: Standing; notes: string;
  createdAt: string; updatedAt: string
}
export interface NpcLog extends Taggable { id: number; npcId: number | null; npcName: string; title: string; content: string; createdAt: string }
export interface LootItem extends Taggable { id: number; name: string; kind: LootKind; quantity: number; description: string; valueGp: number; createdAt: string }
export interface Currency { pp: number; gp: number; sp: number; cp: number }
export interface Ability { id: number; name: string; kind: 'Spell' | 'Ability' | 'Attack'; detail: string; formula: string; uses: string }
export interface CharacterStats {
  id: number; name: string; className: string; level: number; hp: number; maxHp: number; ac: number;
  initiative: number; speed: number; proficiency: number; passivePerception: number; passiveInsight: number;
  passiveInvestigation: number; str: number; dex: number; con: number; int: number; wis: number; cha: number
}
export interface RollLog { id: number; abilityName: string; formula: string; rolls: number[]; modifier: number; total: number; detail: string; createdAt: string }
export interface SearchResult {
  entityType: EntityType; id: number; title: string; excerpt: string; updatedAt: string; tags: string[]; meta?: string
}
export interface DashboardData {
  notes: Note[]; quests: Quest[]; npcs: Npc[]; npcLogs: NpcLog[]; loot: LootItem[];
  currency: Currency; abilities: Ability[]; character: CharacterStats; rolls: RollLog[]; scratch: string
}

export interface NoteInput { id?: number; title: string; content: string; kind?: NoteKind }
export interface QuestInput {
  id?: number; name: string; giver: string; status: QuestStatus; rewards: string; notes: string;
  objectives: Array<{ id?: number; title: string; done: boolean; isSide: boolean }>
}
export interface NpcInput { id?: number; name: string; faction: string; location: string; standing: Standing; notes: string }
export interface LootInput { name: string; kind: LootKind; quantity: number; description: string; valueGp: number }
export interface NpcLogInput { npcId?: number | null; npcName: string; title: string; content: string }
export interface TagInput { entityType: EntityType; entityId: number; tags: string[] }
