import { contextBridge, ipcRenderer } from 'electron'
import type {
  AbilityInput, Ability, CharacterStats, CharacterStatsInput, Currency, DashboardData, EntityType, LootInput, LootItem, Note, NoteInput, Npc, NpcInput, NpcLog, NpcLogInput,
  Quest, QuestInput, RollLog, SearchResult, TagInput,
} from '../shared/types'

const api = {
  getDashboard: (): Promise<DashboardData> => ipcRenderer.invoke('dashboard:get'),
  search: (query: string): Promise<SearchResult[]> => ipcRenderer.invoke('search:all', query),
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
  deleteLoot: (id: number): Promise<boolean> => ipcRenderer.invoke('loot:delete', id),
  saveTags: (input: TagInput): Promise<string[]> => ipcRenderer.invoke('tags:save', input),
  rollAbility: (abilityId: number): Promise<RollLog> => ipcRenderer.invoke('ability:roll', abilityId),
  saveCharacter: (input: CharacterStatsInput): Promise<CharacterStats> => ipcRenderer.invoke('character:save', input),
  saveAbilities: (input: AbilityInput[]): Promise<Ability[]> => ipcRenderer.invoke('abilities:save', input),
}

contextBridge.exposeInMainWorld('spellbook', api)
