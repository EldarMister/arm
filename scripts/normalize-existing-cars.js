import pool from '../server/db.js'
import { runCarTextBackfill } from '../server/lib/carTextBackfill.js'

async function main() {
  const summary = await runCarTextBackfill()

  console.log(`Checked ${summary.total} cars`)
  console.log(`Updated ${summary.updated} cars`)
  console.log(`Skipped ${summary.skipped} cars`)
  console.log(`Errors ${summary.errors} cars`)

  for (const [field, count] of Object.entries(summary.field_totals || {})) {
    console.log(`${field}: ${count}`)
  }

  if (summary.last_error) {
    console.log(`Last error: ${summary.last_error}`)
  }

  if (summary.report.length) {
    console.log('Sample changes:')
    for (const item of summary.report.slice(0, 10).reverse()) {
      console.log(`- id=${item.id}${item.encar_id ? ` encar=${item.encar_id}` : ''} status=${item.status}`)
      for (const change of item.changes || []) {
        console.log(`  ${change.field}: "${change.before ?? ''}" -> "${change.after ?? ''}"`)
      }
      if (item.error) {
        console.log(`  error: ${item.error}`)
      }
    }
  }
}

main()
  .catch((error) => {
    console.error('Failed to normalize existing cars:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
