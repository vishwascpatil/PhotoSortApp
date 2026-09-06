const Tesseract = require('c:/Users/vishw/Desktop/photo-sort/node_modules/tesseract.js');
const sharp = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sharp');

async function test() {
  const filePath = 'C:/Users/vishw/Downloads/17 pro max-backup/IMG_4762.JPG';
  const buf = await sharp(filePath)
    .resize(1000, 1000, { fit: 'inside' })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();

  const worker = await Tesseract.createWorker('eng', 1);
  const t0 = Date.now();
  const res = await worker.recognize(buf);
  console.log(`Recognize finished in ${Date.now() - t0}ms! Confidence: ${res.data.confidence}%`);
  console.log('Sample text:', res.data.text.slice(0, 100));
  await worker.terminate();
}

test().catch(console.error);
