const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');

const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
const testFiles = ['IMG_4898.JPG', 'IMG_4936.JPG', 'IMG_4940.JPG', 'IMG_5031.JPG', 'IMG_5283.JPG', 'IMG_5710.JPG'];

async function testOcr() {
  const worker = await Tesseract.createWorker('eng', 1);
  for (const f of testFiles) {
    try {
      const buf = await sharp(path.join(folder, f))
        .resize(800, 800, { fit: 'inside' })
        .grayscale()
        .png()
        .toBuffer();
      const res = await worker.recognize(buf);
      const text = res.data.text.trim();
      if (text.length > 5) {
        console.log(`[${f}] OCR Text:`, text.replace(/\n+/g, ' ').slice(0, 150));
      } else {
        console.log(`[${f}] OCR Text: (none or short)`);
      }
    } catch(e) {
      console.log(`[${f}] error:`, e.message);
    }
  }
  await worker.terminate();
}

testOcr().catch(console.error);
