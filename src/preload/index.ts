import { contextBridge, ipcRenderer } from 'electron'
import type {
  AbilityInput, Ability, Campaign, CampaignBackup, CampaignInput, CharacterStats, CharacterStatsInput, Currency, DashboardData, EntityType, LootInput, LootItem, Note, NoteInput, Npc, NpcInput, NpcLog, NpcLogInput,
  Quest, QuestInput, RollLog, SearchResult, TagInput, WorkspaceState,
} from '../shared/types'

const api = {
  getDashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  getWorkspaceState: (): Promise<WorkspaceState> => ipcRenderer.invoke('campaigns:state'),
  setActiveCampaign: (id: number): Promise<WorkspaceState> => ipcRenderer.invoke('campaigns:switch', id),
  createCampaign: (input: CampaignInput): Promise<Campaign> => ipcRenderer.invoke('campaigns:create', input),
  updateCampaign: (input: CampaignInput): Promise<Campaign> => ipcRenderer.invoke('campaigns:update', input),
  deleteCampaign: (id: number): Promise<{deleted:boolean;backupPath:string;activeCampaignId:number}> => ipcRenderer.invoke('campaigns:delete', id),
  exportCampaignBackup: (id: number): Promise<CampaignBackup> => ipcRenderer.invoke('campaigns:export-backup', id),
  importCampaignBackup: (backup: CampaignBackup): Promise<Campaign> => ipcRenderer.invoke('campaigns:import-backup', backup),
  search: (query: string, allCampaigns = false): Promise<SearchResult[]> => ipcRenderer.invoke('search:all', query, allCampaigns),
  saveNote: (input: NoteInput): Promise<Note> => ipcRenderer.invoke('note:save', input),
  deleteNote: (id: number): Promise<boolean> => ipcRenderer.invoke('note:delete', id),
  saveQuest: (input: QuestInput): Promise<Quest> => ipcRenderer.invoke('quest:save', input),
  deleteQuest: (id: number): Promise<boolean> => ipcRenderer.invoke('quest:delete', id),
  saveNpc: (input: NpcInput): Promise<Npc> => ipcRenderer.invoke('npc:save', input),
  deleteNpc: (id: number): Promise<boolean> => ipcRenderer.invoke('npc:delete', id),
  saveNpcLog: (input: NpcLogInput): Promise<NpcLog> => ipcRenderer.invoke('npc-log:save', input),
  saveScratch: (content: string): Promise<string> => ipcRenderer.invoke('scratch:save', content),
  saveCurrency: (currency: Currency): Promise<Currency> => ipcRenderer.invoke('currency:save', currency),
  addLoot: (input: LootInput): Promise<LootItem> => ipcRenderer.invoke('loot:add', input),
  saveLoot: (input: LootInput): Promise<LootItem> => ipcRenderer.invoke('loot:save', input),
  deleteLoot: (id: number): Promise<boolean> => ipcRenderer.invoke('loot:delete', id),
  saveTags: (input: TagInput): Promise<string[]> => ipcRenderer.invoke('tags:save', input),
  rollAbility: (abilityId: number): Promise<RollLog> => ipcRenderer.invoke('ability:roll', abilityId),
  saveCharacter: (input: CharacterStatsInput): Promise<CharacterStats> => ipcRenderer.invoke('character:save', input),
  createCharacter: (): Promise<CharacterStats> => ipcRenderer.invoke('character:create'),
  selectCharacter: (id: number): Promise<CharacterStats> => ipcRenderer.invoke('character:select', id),
  deleteCharacter: (id: number): Promise<boolean> => ipcRenderer.invoke('character:delete', id),
  saveAbilities: (input: AbilityInput[]): Promise<Ability[]> => ipcRenderer.invoke('abilities:save', input),
}

contextBridge.exposeInMainWorld('spellbook', api)
