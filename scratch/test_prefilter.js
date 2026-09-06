const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')
const fs = require('fs')
const sharp = require('sharp')

async function test() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db')
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  const testFiles = ['UOZG9928.JPG', 'WQCS1135.JPG', 'XDJE6646.JPG', 'ULGM1796.JPG', 'OLRO0202.JPG', 'SWMB9971.JPG', 'UPVI1423.JPG']
  for (const fn of testFiles) {
    const row = db.exec(`SELECT file_path, extracted_text FROM photos WHERE filename = '${fn}'`)[0]?.values[0]
    if (!row) continue
    const [filePath, text] = row
    console.log(`\nTesting file: ${fn} (exists: ${fs.existsSync(filePath)})`)

    // Color saturation test
    const img = sharp(filePath, { failOn: 'none' })
    const stats = await img.stats()
    const rM = stats.channels[0].mean, gM = stats.channels[1].mean, bM = stats.channels[2].mean
    const maxCh = Math.max(rM, gM, bM), minCh = Math.min(rM, gM, bM)
    const sat = maxCh === 0 ? 0 : (maxCh - minCh) / maxCh

    // Downsample test
    const raw = await img
      .resize(160, 160, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { data, info } = raw
    const { width, height } = info
    const pixels = width * height

    let whitePixels = 0, darkPixels = 0, totalEdges = 0, hEdges = 0, vEdges = 0
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const val = data[idx]
        if (val > 210) whitePixels++
        if (val < 50) darkPixels++
        const gx = Math.abs(data[idx + 1] - data[idx - 1])
        const gy = Math.abs(data[idx + width] - data[idx - width])
        if (gx + gy > 30) totalEdges++
        if (gy > 20) hEdges++
        if (gx > 20) vEdges++
      }
    }

    const whiteRatio = whitePixels / pixels
    const darkRatio = darkPixels / pixels
    const edgeDensity = totalEdges / pixels
    const hvRatio = vEdges > 0 ? hEdges / vEdges : 1

    const isWhitePaperDoc = whiteRatio > 0.40 && edgeDensity > 0.08 && sat < 0.20
    const isTextDoc = sat < 0.12 && edgeDensity > 0.12 && (hvRatio > 1.20 || whiteRatio > 0.25 || darkRatio > 0.25)
    const isCardDoc = sat < 0.25 && edgeDensity > 0.20 && hvRatio > 1.25

    console.log(`  sat: ${sat.toFixed(3)}, whiteRatio: ${whiteRatio.toFixed(3)}, darkRatio: ${darkRatio.toFixed(3)}, edgeDensity: ${edgeDensity.toFixed(3)}, hvRatio: ${hvRatio.toFixed(3)}`)
    console.log(`  isWhitePaper: ${isWhitePaperDoc}, isTextDoc: ${isTextDoc}, isCardDoc: ${isCardDoc}`)
    console.log(`  --> Pass isDocumentCandidate: ${isWhitePaperDoc || isTextDoc || isCardDoc}`)
  }
}

test().catch(console.error)
