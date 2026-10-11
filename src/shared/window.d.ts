import type {
  Ability, AbilityInput, Campaign, CampaignBackup, CampaignInput, CharacterStats, CharacterStatsInput, Currency, DashboardData, LootInput, LootItem, Note, NoteInput, Npc, NpcInput, NpcLog, NpcLogInput,
  Quest, QuestInput, RollLog, SearchResult, TagInput, WorkspaceState,
} from './types'

declare global {
  interface Window {
    spellbook: {
      getDashboard(): Promise<DashboardData>
      getWorkspaceState(): Promise<WorkspaceState>
      setActiveCampaign(id: number): Promise<WorkspaceState>
      createCampaign(input: CampaignInput): Promise<Campaign>
      updateCampaign(input: CampaignInput): Promise<Campaign>
      deleteCampaign(id: number): Promise<{deleted:boolean;backupPath:string;activeCampaignId:number}>
      exportCampaignBackup(id: number): Promise<CampaignBackup>
      exportCampaignWord(): Promise<{ cancelled: boolean; filePath?: string }>
      importCampaignBackup(backup: CampaignBackup): Promise<Campaign>
      search(query: string, allCampaigns?: boolean): Promise<SearchResult[]>
      saveNote(input: NoteInput): Promise<Note>
      deleteNote(id: number): Promise<boolean>
      saveQuest(input: QuestInput): Promise<Quest>
      deleteQuest(id: number): Promise<boolean>
      saveNpc(input: NpcInput): Promise<Npc>
      deleteNpc(id: number): Promise<boolean>
      saveNpcLog(input: NpcLogInput): Promise<NpcLog>
      saveScratch(content: string): Promise<string>
      saveCurrency(currency: Currency): Promise<Currency>
      addLoot(input: LootInput): Promise<LootItem>
      saveLoot(input: LootInput): Promise<LootItem>
      deleteLoot(id: number): Promise<boolean>
      saveTags(input: TagInput): Promise<string[]>
      rollAbility(abilityId: number): Promise<RollLog>
      saveCharacter(input: CharacterStatsInput): Promise<CharacterStats>
      createCharacter(): Promise<CharacterStats>
      selectCharacter(id: number): Promise<CharacterStats>
      deleteCharacter(id: number): Promise<boolean>
      saveAbilities(input: AbilityInput[]): Promise<Ability[]>
    }
  }
}
export {}
