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
  id: number; name: string; faction: string; location: string; standing: Standing; notes: string; imageData: string;
  createdAt: string; updatedAt: string
}
export interface NpcLog extends Taggable { id: number; npcId: number | null; npcName: string; title: string; content: string; createdAt: string }
export interface LootItem extends Taggable { id: number; name: string; kind: LootKind; quantity: number; description: string; valueGp: number; createdAt: string }
export interface Currency { pp: number; gp: number; sp: number; cp: number }

export interface Campaign {
  id: number; name: string; description: string; setting: string; ruleset: string; imageData: string;
  createdAt: string; updatedAt: string; lastOpenedAt: string
}
export interface CampaignInput { id?: number; name: string; description: string; setting: string; ruleset: string; imageData: string }
export interface WorkspaceState { campaigns: Campaign[]; activeCampaignId: number }
export interface Ability { id: number; name: string; kind: 'Spell' | 'Ability' | 'Attack'; detail: string; formula: string; uses: string }
export interface CharacterStats {
  id: number; name: string; species: string; background: string; alignment: string; backstory: string; personalityTraits: string; ideals: string; bonds: string; flaws: string;
  className: string; level: number; experience: number; hp: number; maxHp: number; ac: number;
  initiative: number; speed: number; proficiency: number; passivePerception: number; passiveInsight: number;
  passiveInvestigation: number; str: number; dex: number; con: number; int: number; wis: number; cha: number
}
export type CharacterStatsInput = Omit<CharacterStats, 'id'> & { id?: number }
export interface AbilityInput { id?: number; name: string; kind: Ability['kind']; detail: string; formula: string; uses: string }
export interface RollLog { id: number; abilityName: string; formula: string; rolls: number[]; modifier: number; total: number; detail: string; createdAt: string }
export interface SearchResult {
  entityType: EntityType; id: number; title: string; excerpt: string; updatedAt: string; tags: string[]; meta?: string; campaignId?: number; campaignName?: string; matchTerm?: string; matchKind?: 'text' | 'tag' | 'both'
}
export interface RelatedTag { name: string; count: number }
export interface DashboardData {
  campaign: Campaign; characters: CharacterStats[]; notes: Note[]; quests: Quest[]; npcs: Npc[]; npcLogs: NpcLog[]; loot: LootItem[];
  currency: Currency; abilities: Ability[]; character: CharacterStats; rolls: RollLog[]; scratch: string
}
export interface CampaignBackup { format: 'spellbook-and-quill-campaign'; version: 1; exportedAt: string; campaign: CampaignInput; content: Record<string, unknown> }

export interface NoteInput { id?: number; title: string; content: string; kind?: NoteKind }
export interface QuestInput {
  id?: number; name: string; giver: string; status: QuestStatus; rewards: string; notes: string;
  objectives: Array<{ id?: number; title: string; done: boolean; isSide: boolean }>
}
export interface NpcInput { id?: number; name: string; faction: string; location: string; standing: Standing; notes: string; imageData: string }
export interface LootInput { id?: number; name: string; kind: LootKind; quantity: number; description: string; valueGp: number }
export interface NpcLogInput { id?: number; npcId?: number | null; npcName: string; title: string; content: string }
export interface TagInput { entityType: EntityType; entityId: number; tags: string[]; campaignId?: number }
