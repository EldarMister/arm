import fs from 'fs/promises'
import path from 'path'

const DEFAULT_STATE = Object.freeze({
  lastUpdateId: 0,
  sessions: {},
  seenListings: {},
})

const DEFAULT_PARSE_SCOPE = 'all'
const SEEN_LISTING_TTL_MS = 14 * 24 * 60 * 60 * 1000
const MAX_SEEN_LISTINGS = 8000

function cloneDefaultState() {
  return {
    lastUpdateId: DEFAULT_STATE.lastUpdateId,
    sessions: {},
    seenListings: {},
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeChatId(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function normalizeParseScope(value) {
  return value === 'domestic'
    || value === 'imported'
    || value === 'japanese'
    || value === 'german'
    ? value
    : DEFAULT_PARSE_SCOPE
}

function buildDefaultSession(chatId) {
  return {
    chatId: normalizeChatId(chatId),
    parseScope: DEFAULT_PARSE_SCOPE,
    isActive: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function normalizeState(rawState) {
  const state = cloneDefaultState()
  if (!rawState || typeof rawState !== 'object') return state

  state.lastUpdateId = Math.max(0, Number(rawState.lastUpdateId) || 0)

  if (rawState.sessions && typeof rawState.sessions === 'object' && !Array.isArray(rawState.sessions)) {
    for (const [chatId, session] of Object.entries(rawState.sessions)) {
      const normalizedChatId = normalizeChatId(chatId)
      if (!normalizedChatId) continue

      state.sessions[normalizedChatId] = {
        ...buildDefaultSession(normalizedChatId),
        ...session,
        chatId: normalizedChatId,
        parseScope: normalizeParseScope(session?.parseScope),
        isActive: Boolean(session?.isActive),
        username: cleanText(session?.username),
        firstName: cleanText(session?.firstName),
        lastName: cleanText(session?.lastName),
        updatedAt: cleanText(session?.updatedAt) || new Date().toISOString(),
      }
    }
  }

  if (rawState.seenListings && typeof rawState.seenListings === 'object' && !Array.isArray(rawState.seenListings)) {
    for (const [encarId, listing] of Object.entries(rawState.seenListings)) {
      const normalizedEncarId = cleanText(encarId)
      if (!normalizedEncarId) continue

      state.seenListings[normalizedEncarId] = {
        encarId: normalizedEncarId,
        updatedAt: cleanText(listing?.updatedAt) || new Date().toISOString(),
        firstSeenAt: cleanText(listing?.firstSeenAt) || cleanText(listing?.updatedAt) || new Date().toISOString(),
        notifiedAt: cleanText(listing?.notifiedAt),
        priceKrw: Math.max(0, Number(listing?.priceKrw) || 0),
        viewCount: Math.max(0, Number(listing?.viewCount) || 0),
        callCount: Math.max(0, Number(listing?.callCount) || 0),
        subscribeCount: Math.max(0, Number(listing?.subscribeCount) || 0),
        qualifiesFresh: Boolean(listing?.qualifiesFresh),
      }
    }
  }

  return state
}

export class LocalStateStore {
  constructor(filePath) {
    this.filePath = filePath
    this.state = cloneDefaultState()
    this.loaded = false
    this.flushPromise = Promise.resolve()
  }

  async load() {
    if (this.loaded) return this.state

    let shouldCreateStateFile = false
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      this.state = normalizeState(JSON.parse(raw))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      this.state = cloneDefaultState()
      shouldCreateStateFile = true
    }

    this.loaded = true
    this.pruneSeenListings()
    if (shouldCreateStateFile) {
      await this.flush()
    }
    return this.state
  }

  async flush() {
    await this.load()
    const payload = JSON.stringify(this.state, null, 2)
    const directory = path.dirname(this.filePath)

    this.flushPromise = this.flushPromise
      .catch(() => null)
      .then(async () => {
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(this.filePath, payload, 'utf8')
      })

    return this.flushPromise
  }

  getLastUpdateId() {
    return Math.max(0, Number(this.state.lastUpdateId) || 0)
  }

  setLastUpdateId(updateId) {
    this.state.lastUpdateId = Math.max(0, Number(updateId) || 0)
  }

  getSession(chatId) {
    const normalizedChatId = normalizeChatId(chatId)
    if (!normalizedChatId) return null

    if (!this.state.sessions[normalizedChatId]) {
      this.state.sessions[normalizedChatId] = buildDefaultSession(normalizedChatId)
    }

    return { ...this.state.sessions[normalizedChatId] }
  }

  upsertSession(chatId, patch = {}) {
    const normalizedChatId = normalizeChatId(chatId)
    if (!normalizedChatId) return null

    const current = this.state.sessions[normalizedChatId] || buildDefaultSession(normalizedChatId)
    const next = {
      ...current,
      ...patch,
      chatId: normalizedChatId,
      parseScope: normalizeParseScope(patch.parseScope ?? current.parseScope),
      isActive: typeof patch.isActive === 'boolean' ? patch.isActive : Boolean(current.isActive),
      username: cleanText(patch.username ?? current.username),
      firstName: cleanText(patch.firstName ?? current.firstName),
      lastName: cleanText(patch.lastName ?? current.lastName),
      updatedAt: new Date().toISOString(),
    }

    this.state.sessions[normalizedChatId] = next
    return { ...next }
  }

  deactivateSession(chatId) {
    return this.upsertSession(chatId, { isActive: false })
  }

  getActiveSessions() {
    return Object.values(this.state.sessions)
      .filter((session) => session?.isActive)
      .map((session) => ({ ...session }))
  }

  getSeenListing(encarId) {
    const normalizedEncarId = cleanText(encarId)
    if (!normalizedEncarId) return null
    const listing = this.state.seenListings[normalizedEncarId]
    return listing ? { ...listing } : null
  }

  rememberListing(encarId, payload = {}) {
    const normalizedEncarId = cleanText(encarId)
    if (!normalizedEncarId) return null

    const nowIso = new Date().toISOString()
    const current = this.state.seenListings[normalizedEncarId] || {
      encarId: normalizedEncarId,
      firstSeenAt: nowIso,
    }

    const next = {
      ...current,
      ...payload,
      encarId: normalizedEncarId,
      priceKrw: Math.max(0, Number(payload?.priceKrw ?? current.priceKrw) || 0),
      viewCount: Math.max(0, Number(payload?.viewCount ?? current.viewCount) || 0),
      callCount: Math.max(0, Number(payload?.callCount ?? current.callCount) || 0),
      subscribeCount: Math.max(0, Number(payload?.subscribeCount ?? current.subscribeCount) || 0),
      qualifiesFresh: Boolean(payload?.qualifiesFresh ?? current.qualifiesFresh),
      notifiedAt: cleanText(payload?.notifiedAt ?? current.notifiedAt),
      updatedAt: nowIso,
    }

    this.state.seenListings[normalizedEncarId] = next
    this.pruneSeenListings()
    return { ...next }
  }

  pruneSeenListings() {
    const now = Date.now()
    const seenEntries = Object.entries(this.state.seenListings)
    const filteredEntries = seenEntries.filter(([, listing]) => {
      const updatedAtMs = new Date(listing?.updatedAt || 0).getTime()
      return Number.isFinite(updatedAtMs) && now - updatedAtMs <= SEEN_LISTING_TTL_MS
    })

    filteredEntries.sort((left, right) => {
      const rightMs = new Date(right[1]?.updatedAt || 0).getTime()
      const leftMs = new Date(left[1]?.updatedAt || 0).getTime()
      return rightMs - leftMs
    })

    this.state.seenListings = Object.fromEntries(filteredEntries.slice(0, MAX_SEEN_LISTINGS))
  }
}
