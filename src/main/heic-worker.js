const { parentPort } = require('worker_threads')
const heicConvert = require('heic-convert')
const sharp = require('sharp')
const fs = require('fs')

if (parentPort) {
  parentPort.on('message', async (task) => {
    const { id, filePath, thumbnailPath, size, quality } = task
    try {
      const inputBuffer = fs.readFileSync(filePath)
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.65
      }).catch(() => null)

      if (!outputBuffer) {
        parentPort.postMessage({ id, success: false })
        return
      }

      const targetSize = size || 400
      const isHighRes = targetSize > 600
      const jpegQuality = isHighRes ? Math.round((quality || 0.88) * 100) : 75

      const pipeline = sharp(Buffer.from(outputBuffer)).rotate()
      if (isHighRes) {
        pipeline.resize({ width: targetSize, height: targetSize, fit: 'inside', withoutEnlargement: true })
      } else {
        pipeline.resize(targetSize, targetSize, { fit: 'cover', position: 'centre' })
      }

      await pipeline.jpeg({ quality: jpegQuality, mozjpeg: false }).toFile(thumbnailPath)

      parentPort.postMessage({ id, success: true, thumbnailPath })
    } catch (err) {
      parentPort.postMessage({ id, success: false, error: err ? err.message : 'HEIC error' })
    }
  })
}
