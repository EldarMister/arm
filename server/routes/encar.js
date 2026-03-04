import { Router } from 'express'
import axios from 'axios'
import * as cheerio from 'cheerio'

const router = Router()

// GET /api/encar/:encarId — парсинг машины с Encar.com по ID
router.get('/:encarId', async (req, res) => {
  try {
    const { encarId } = req.params
    const url = `https://www.encar.com/dc/dc_cardetailview.do?carid=${encarId}`

    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      timeout: 15000,
    })

    const $ = cheerio.load(html)

    // Название и год
    const titleRaw = $('h3.tit').text().trim() || $('title').text().trim()
    const name = titleRaw.replace(/\s+/g, ' ')

    // Цена KRW
    const priceText = $('.price strong').first().text().replace(/[^0-9]/g, '')
    const priceKRW = priceText ? parseInt(priceText) * 10000 : 0

    // Пробег
    const mileageText = $('dt:contains("주행거리")').next('dd').text().trim()
    const mileage = parseInt(mileageText.replace(/[^0-9]/g, '')) || 0

    // Год
    const yearText = $('dt:contains("연식")').next('dd').text().trim()
    const year = yearText.replace(/[^0-9-]/g, '') || ''

    // Регион
    const location = $('dt:contains("지역")').next('dd').text().trim() || ''

    // VIN / номер
    const vin = $('dt:contains("차대번호")').next('dd').text().trim() || ''

    // Цвет
    const bodyColor = $('dt:contains("색상")').next('dd').text().trim() || ''

    // Фото — получаем список URL
    const images = []
    $('ul.img_list li img, div.gallery img, .swiper-slide img').each((_i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src')
      if (src && src.startsWith('http') && !images.includes(src)) {
        images.push(src)
      }
    })

    // Конвертация KRW → USD (приблизительно)
    const KRW_TO_USD = 0.00073
    const priceUSD = Math.round(priceKRW * KRW_TO_USD)

    res.json({
      encar_id:   encarId,
      encar_url:  url,
      name:       name || 'Неизвестно',
      year,
      mileage,
      body_color: bodyColor,
      location,
      vin,
      price_krw:  priceKRW,
      price_usd:  priceUSD,
      images,
      // Расчёт под ключ (примерный)
      commission:  200,
      delivery:   1750,
      loading:       0,
      unloading:   100,
      storage:     310,
      vat_refund:  Math.round(priceUSD * 0.063),
      total:       Math.round(priceUSD + 200 + 1750 + 100 + 310 - Math.round(priceUSD * 0.063)),
    })
  } catch (err) {
    console.error('Encar parse error:', err.message)
    res.status(500).json({ error: 'Ошибка парсинга Encar', details: err.message })
  }
})

export default router
