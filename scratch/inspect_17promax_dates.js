const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifReader = require('exif-reader');

async function inspectDates() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folder);
  const dateCounts = {};
  const samplesByDate = {};

  for (const f of files) {
    const full = path.join(folder, f);
    try {
      const meta = await sharp(full).metadata();
      if (meta && meta.exif) {
        const parsed = exifReader(meta.exif);
        const dt = parsed.photo?.DateTimeOriginal || parsed.photo?.DateTimeDigitized || parsed.image?.ModifyDate;
        if (dt) {
          const dStr = dt instanceof Date ? dt.toISOString().slice(0, 10) : String(dt).slice(0, 10).replace(/:/g, '-');
          dateCounts[dStr] = (dateCounts[dStr] || 0) + 1;
          if (!samplesByDate[dStr]) samplesByDate[dStr] = [];
          if (samplesByDate[dStr].length < 3) samplesByDate[dStr].push(f);
        }
      }
    } catch (e) {}
  }

  const sortedDates = Object.entries(dateCounts).sort((a, b) => b[1] - a[1]);
  console.log('Top Dates in 17 pro max-backup:');
  sortedDates.slice(0, 25).forEach(([d, count]) => {
    console.log(`  Date ${d}: ${count} photos (sample: ${samplesByDate[d].join(', ')})`);
  });
}

inspectDates().catch(console.error);
