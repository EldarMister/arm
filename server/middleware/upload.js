import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/
  const ext = path.extname(file.originalname).toLowerCase()
  allowed.test(ext) ? cb(null, true) : cb(new Error('Только изображения (jpeg, png, webp)'))
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})
