import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import {
  addLoot, closeDatabase, deleteLoot, deleteNote, deleteNpc, deleteQuest, getDashboard, initDatabase,
  rollAbility, saveCurrency, saveNote, saveNpc, saveNpcLog, saveQuest, saveScratch, saveTags, searchAll,
} from './database'
import type { Currency, LootInput, NoteInput, NpcInput, NpcLogInput, QuestInput, TagInput } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function trustedSender(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith('file://')) return true
  if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return true
  return /^http:\/\/localhost:\d+\//.test(url)
}
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event)) throw new Error('Blocked IPC request from an untrusted renderer')
    return fn(...args)
  })
}
function registerIpc() {
  handle('dashboard:get', () => getDashboard())
  handle('search:all', (q: string) => searchAll(q))
  handle('note:save', (input: NoteInput) => saveNote(input))
  handle('note:delete', (id: number) => deleteNote(id))
  handle('quest:save', (input: QuestInput) => saveQuest(input))
  handle('quest:delete', (id: number) => deleteQuest(id))
  handle('npc:save', (input: NpcInput) => saveNpc(input))
  handle('npc:delete', (id: number) => deleteNpc(id))
  handle('npc-log:save', (input: NpcLogInput) => saveNpcLog(input))
  handle('scratch:save', (content: string) => saveScratch(content))
  handle('currency:save', (input: Currency) => saveCurrency(input))
  handle('loot:add', (input: LootInput) => addLoot(input))
  handle('loot:delete', (id: number) => deleteLoot(id))
  handle('tags:save', (input: TagInput) => saveTags(input))
  handle('ability:roll', (id: number) => rollAbility(id))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    title: 'Spellbook & Quill',
    backgroundColor: '#0b0c10',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl ? !url.startsWith(devUrl) : !url.startsWith('file://')) event.preventDefault()
  })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  try {
    await initDatabase()
    registerIpc()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  } catch (error) {
    console.error('Failed to initialise Spellbook & Quill:', error)
    app.quit()
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => closeDatabase())
