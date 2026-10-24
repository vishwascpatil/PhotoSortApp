import path from 'path'
import fs from 'fs'
import sharp from 'sharp'

export interface FixtureInfo {
  dir: string
  files: {
    name: string
    path: string
    type: 'photo' | 'duplicate' | 'screenshot' | 'document' | 'junk'
  }[]
}

export async function generateTestFixtures(customDir?: string): Promise<FixtureInfo> {
  const baseDir = customDir || path.join(process.cwd(), 'test-fixtures', 'sample-library')
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  const generatedFiles: FixtureInfo['files'] = []

  // 1. Regular Photo 1 (Landscape 1200x800)
  const photo1Path = path.join(baseDir, 'sunset_beach.jpg')
  if (!fs.existsSync(photo1Path)) {
    const svg1 = Buffer.from(`
      <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ff7e5f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#feb47b;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="800" fill="url(#grad1)" />
        <circle cx="600" cy="400" r="150" fill="#fff" opacity="0.8" />
        <text x="600" y="700" font-size="48" text-anchor="middle" fill="#ffffff" font-family="sans-serif">Sunset Beach 2026</text>
      </svg>
    `)
    await sharp(svg1).jpeg({ quality: 90 }).toFile(photo1Path)
  }
  generatedFiles.push({ name: 'sunset_beach.jpg', path: photo1Path, type: 'photo' })

  // 2. Regular Photo 2 (Mountain 1600x900)
  const photo2Path = path.join(baseDir, 'mountain_lake.jpg')
  if (!fs.existsSync(photo2Path)) {
    const svg2 = Buffer.from(`
      <svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#1e3c72;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#2a5298;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#grad2)" />
        <polygon points="400,700 800,200 1200,700" fill="#4a76a8" />
        <polygon points="700,700 1000,350 1300,700" fill="#3b5998" />
        <text x="800" y="800" font-size="42" text-anchor="middle" fill="#ffffff" font-family="sans-serif">Blue Mountain Lake</text>
      </svg>
    `)
    await sharp(svg2).jpeg({ quality: 90 }).toFile(photo2Path)
  }
  generatedFiles.push({ name: 'mountain_lake.jpg', path: photo2Path, type: 'photo' })

  // 3. Exact Duplicate of Photo 1
  const dupExactPath = path.join(baseDir, 'sunset_beach_copy.jpg')
  if (!fs.existsSync(dupExactPath)) {
    fs.copyFileSync(photo1Path, dupExactPath)
  }
  generatedFiles.push({ name: 'sunset_beach_copy.jpg', path: dupExactPath, type: 'duplicate' })

  // 4. Similar Duplicate of Photo 1 (Slightly resized)
  const dupSimilarPath = path.join(baseDir, 'sunset_beach_resized.jpg')
  if (!fs.existsSync(dupSimilarPath)) {
    await sharp(photo1Path).resize(1180, 786).jpeg({ quality: 85 }).toFile(dupSimilarPath)
  }
  generatedFiles.push({ name: 'sunset_beach_resized.jpg', path: dupSimilarPath, type: 'duplicate' })

  // 5. Screenshot (1920x1080 typical desktop aspect ratio with UI text)
  const screenshotPath = path.join(baseDir, 'Screenshot_2026-03-15.png')
  if (!fs.existsSync(screenshotPath)) {
    const svgScreenshot = Buffer.from(`
      <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
        <rect width="1920" height="1080" fill="#1e1e2e" />
        <rect x="0" y="0" width="1920" height="40" fill="#181825" />
        <circle cx="20" cy="20" r="6" fill="#f38ba8" />
        <circle cx="40" cy="20" r="6" fill="#f9e2af" />
        <circle cx="60" cy="20" r="6" fill="#a6e3a1" />
        <text x="100" y="26" font-size="16" fill="#cdd6f4" font-family="monospace">Visual Studio Code - Application.tsx</text>
        <rect x="50" y="80" width="800" height="400" rx="8" fill="#313244" />
        <text x="80" y="140" font-size="24" fill="#89b4fa" font-family="monospace">const debug = true;</text>
        <text x="80" y="190" font-size="24" fill="#a6e3a1" font-family="monospace">export default function App() {}</text>
      </svg>
    `)
    await sharp(svgScreenshot).png().toFile(screenshotPath)
  }
  generatedFiles.push({ name: 'Screenshot_2026-03-15.png', path: screenshotPath, type: 'screenshot' })

  // 6. OCR Document (High-contrast text on white document)
  const docPath = path.join(baseDir, 'Doc_Invoice_1042.jpg')
  if (!fs.existsSync(docPath)) {
    const svgDoc = Buffer.from(`
      <svg width="1000" height="1400" xmlns="http://www.w3.org/2000/svg">
        <rect width="1000" height="1400" fill="#ffffff" />
        <text x="80" y="120" font-size="36" font-weight="bold" fill="#000000" font-family="sans-serif">OFFICIAL INVOICE</text>
        <text x="80" y="180" font-size="20" fill="#333333" font-family="sans-serif">Invoice Number: INV-2026-1042</text>
        <text x="80" y="220" font-size="20" fill="#333333" font-family="sans-serif">Date: October 20, 2026</text>
        <line x1="80" y1="260" x2="920" y2="260" stroke="#cccccc" stroke-width="2" />
        <text x="80" y="320" font-size="22" font-weight="bold" fill="#111111" font-family="sans-serif">Item Description</text>
        <text x="750" y="320" font-size="22" font-weight="bold" fill="#111111" font-family="sans-serif">Amount</text>
        <text x="80" y="380" font-size="18" fill="#444444" font-family="sans-serif">1. Photography License Subscription</text>
        <text x="750" y="380" font-size="18" fill="#444444" font-family="sans-serif">$249.00</text>
        <text x="80" y="440" font-size="18" fill="#444444" font-family="sans-serif">2. Cloud Backup Storage (500GB)</text>
        <text x="750" y="440" font-size="18" fill="#444444" font-family="sans-serif">$50.00</text>
        <line x1="80" y1="500" x2="920" y2="500" stroke="#cccccc" stroke-width="2" />
        <text x="600" y="560" font-size="24" font-weight="bold" fill="#000000" font-family="sans-serif">Total Due: $299.00</text>
      </svg>
    `)
    await sharp(svgDoc).jpeg({ quality: 95 }).toFile(docPath)
  }
  generatedFiles.push({ name: 'Doc_Invoice_1042.jpg', path: docPath, type: 'document' })

  // 7. Social Media Junk / Low-Res Thumbnail (200x200)
  const junkPath = path.join(baseDir, 'whatsapp_sticker_sample.jpg')
  if (!fs.existsSync(junkPath)) {
    const svgJunk = Buffer.from(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="#25d366" />
        <circle cx="100" cy="100" r="60" fill="#ffffff" />
        <text x="100" y="110" font-size="28" text-anchor="middle" fill="#25d366" font-family="sans-serif">OK</text>
      </svg>
    `)
    await sharp(svgJunk).blur(2).jpeg({ quality: 50 }).toFile(junkPath)
  }
  generatedFiles.push({ name: 'whatsapp_sticker_sample.jpg', path: junkPath, type: 'junk' })

  return {
    dir: baseDir,
    files: generatedFiles
  }
}

if (require.main === module) {
  generateTestFixtures().then(info => {
    console.log(`Successfully generated ${info.files.length} test fixtures in ${info.dir}`)
  }).catch(err => {
    console.error('Failed to generate test fixtures:', err)
    process.exit(1)
  })
}
