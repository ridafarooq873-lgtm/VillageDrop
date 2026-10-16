import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Absolute path to the uploads directory (backend/uploads)
export const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads')

// Ensure the directory exists at startup
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${file.fieldname}-${unique}${ext}`)
  },
})

const ALLOWED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
])

function fileFilter(req, file, cb) {
  if (ALLOWED.has(file.mimetype)) return cb(null, true)
  cb(new Error('Only images (jpg, png, webp, heic) and PDF files are allowed'))
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

/** Public URL path for a stored file, served from /uploads */
export const publicUrl = (file) => (file ? `/uploads/${file.filename}` : null)

export default upload
