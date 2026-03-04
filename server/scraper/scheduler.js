import cron from 'node-cron'
import { runScrapeJob } from './job.js'
import { state } from './state.js'

let task = null

/**
 * Build cron expression from config:
 *   'hourly'  → every N hours (intervalHours)
 *   'daily'   → every day at state.config.hour:00
 *   'manual'  → no cron
 */
function buildCronExpr(config) {
  const { schedule, hour = 10, intervalHours = 1 } = config

  if (schedule === 'hourly') {
    const interval = Math.max(1, Math.min(12, intervalHours))
    return `0 */${interval} * * *`
  }
  if (schedule === 'daily') {
    const h = Math.max(0, Math.min(23, hour))
    return `0 ${h} * * *`
  }
  return null
}

function computeNextRun(cronExpr) {
  try {
    // Use node-cron v3 interval API if available
    const schedule = cron.schedule(cronExpr, () => {}, { scheduled: false })
    if (schedule.nextDate) {
      return schedule.nextDate().toISO()
    }
  } catch { /* ignore */ }
  return null
}

export function startScheduler(config = state.config) {
  stopScheduler()

  const cronExpr = buildCronExpr(config)
  if (!cronExpr) {
    state.info('📅 Расписание: Вручную (автозапуск отключён)')
    state.nextRun = null
    return
  }

  state.info(`⏰ Планировщик запущен: "${config.schedule}", cron="${cronExpr}"`)
  state.nextRun = computeNextRun(cronExpr)

  task = cron.schedule(cronExpr, async () => {
    state.info(`⏰ Автозапуск по расписанию (лимит: ${state.config.dailyLimit})`)
    try {
      await runScrapeJob(state.config.dailyLimit)
    } catch (err) {
      state.error(`Ошибка автозапуска: ${err.message}`)
    }
  })

  state.cronJob = task
}

export function stopScheduler() {
  if (task) {
    task.stop()
    task = null
    state.cronJob = null
    state.nextRun = null
  }
}
