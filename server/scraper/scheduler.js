import { runScrapeJob } from './job.js'
import { state } from './state.js'

let task = null

function parseLastRun() {
  if (!state.lastRun) return null
  const value = new Date(state.lastRun)
  return Number.isNaN(value.getTime()) ? null : value
}

function getNextHourlyRun(config, now = new Date()) {
  const intervalHours = Math.max(1, Math.min(12, Number.parseInt(config.intervalHours, 10) || 1))
  const intervalMs = intervalHours * 60 * 60 * 1000
  const lastRun = parseLastRun()

  let nextRun = lastRun ? new Date(lastRun.getTime() + intervalMs) : new Date(now.getTime() + intervalMs)
  while (nextRun.getTime() <= now.getTime()) {
    nextRun = new Date(nextRun.getTime() + intervalMs)
  }

  return nextRun
}

function getNextDailyRun(config, now = new Date()) {
  const nextRun = new Date(now)
  const hour = Math.max(0, Math.min(23, Number.parseInt(config.hour, 10) || 10))
  nextRun.setHours(hour, 0, 0, 0)

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1)
  }

  return nextRun
}

function getNextRun(config, now = new Date()) {
  if (config.schedule === 'hourly') {
    return getNextHourlyRun(config, now)
  }

  if (config.schedule === 'daily') {
    return getNextDailyRun(config, now)
  }

  return null
}

function formatScheduleLabel(config) {
  if (config.schedule === 'hourly') {
    return `каждые ${Math.max(1, Math.min(12, Number.parseInt(config.intervalHours, 10) || 1))} ч`
  }

  if (config.schedule === 'daily') {
    const hour = Math.max(0, Math.min(23, Number.parseInt(config.hour, 10) || 10))
    return `ежедневно в ${String(hour).padStart(2, '0')}:00`
  }

  return 'вручную'
}

function scheduleNext(config = state.config) {
  const nextRun = getNextRun(config)
  if (!nextRun) {
    state.nextRun = null
    state.cronJob = null
    return
  }

  const delay = Math.max(1000, nextRun.getTime() - Date.now())
  state.nextRun = nextRun.toISOString()

  task = setTimeout(async () => {
    task = null
    state.cronJob = null
    state.nextRun = null

    if (state.config.schedule === 'manual') {
      return
    }

    if (state.isRunning) {
      state.warn('Автозапуск пропущен: парсер уже выполняется')
      scheduleNext(state.config)
      return
    }

    state.info(`⏰ Автозапуск по расписанию (лимит: ${state.config.dailyLimit})`)
    try {
      await runScrapeJob(state.config.dailyLimit)
    } catch (err) {
      state.error(`Ошибка автозапуска: ${err.message}`)
    } finally {
      scheduleNext(state.config)
    }
  }, delay)

  state.cronJob = task
}

export function startScheduler(config = state.config) {
  stopScheduler()

  if (config.schedule === 'manual') {
    state.info('📅 Расписание: вручную (автозапуск отключен)')
    state.nextRun = null
    return
  }

  scheduleNext(config)
  state.info(`⏰ Планировщик запущен: ${formatScheduleLabel(config)}${state.nextRun ? `, следующий запуск ${state.nextRun}` : ''}`)
}

export function stopScheduler() {
  if (task) {
    clearTimeout(task)
    task = null
  }

  state.cronJob = null
  state.nextRun = null
}
