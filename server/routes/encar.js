import { Router } from 'express'
import { fetchEncarVehicleDetail } from '../lib/encarVehicle.js'

const router = Router()

router.get('/:encarId', async (req, res) => {
  try {
    const { encarId } = req.params
    const includeInspection = req.query.includeInspection === '1' || req.query.includeInspection === 'true'
    const detail = await fetchEncarVehicleDetail(encarId, { includeInspection })
    return res.json(detail)
  } catch (err) {
    console.error('Encar parse error:', err.message)
    const status = err?.response?.status
    if (status === 404) {
      return res.status(404).json({ error: 'Автомобиль не найден в Encar API' })
    }
    return res.status(500).json({ error: 'Ошибка парсинга Encar', details: err.message })
  }
})

export default router
