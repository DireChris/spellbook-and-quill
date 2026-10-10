import type {
  Ability, AbilityInput, CharacterStats, CharacterStatsInput, Currency, DashboardData, LootInput, LootItem, Note, NoteInput, Npc, NpcInput, NpcLog, NpcLogInput,
  Quest, QuestInput, RollLog, SearchResult, TagInput,
} from './types'

declare global {
  interface Window {
    spellbook: {
      getDashboard(): Promise<DashboardData>
      search(query: string): Promise<SearchResult[]>
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
      deleteLoot(id: number): Promise<boolean>
      saveTags(input: TagInput): Promise<string[]>
      rollAbility(abilityId: number): Promise<RollLog>
      saveCharacter(input: CharacterStatsInput): Promise<CharacterStats>
      saveAbilities(input: AbilityInput[]): Promise<Ability[]>
    }
  }
}
export {}
