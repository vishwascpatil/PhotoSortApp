const fs = require('fs');
const path = require('path');
const exifr = require('exifr');

async function inspectFolder() {
  const folderPath = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folderPath);
  console.log(`Scanning ${files.length} files on disk in ${folderPath}...`);

  const results = [];
  let gpsCount = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = path.extname(f).toLowerCase();
    if (!['.jpg', '.jpeg', '.heic', '.png', '.mov', '.mp4'].includes(ext)) continue;

    const fullPath = path.join(folderPath, f);
    try {
      // Parse gps and date
      const data = await exifr.parse(fullPath, ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate']);
      if (data && data.latitude && data.longitude) {
        gpsCount++;
        results.push({
          file: f,
          lat: data.latitude,
          lon: data.longitude,
          date: data.DateTimeOriginal || data.CreateDate
        });
      }
    } catch (e) {}

    if ((i + 1) % 200 === 0) {
      console.log(`Checked ${i + 1}/${files.length} files... found ${gpsCount} with GPS so far`);
    }
  }

  console.log(`\nDONE! Total files with GPS: ${gpsCount} out of ${files.length}`);
  
  // Cluster GPS coordinates
  const clusters = {};
  for (const r of results) {
    const key = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
    if (!clusters[key]) clusters[key] = { count: 0, sample: r, dates: [] };
    clusters[key].count++;
    if (r.date) clusters[key].dates.push(r.date);
  }

  console.log('GPS Clusters found on disk:', JSON.stringify(clusters, null, 2));
}

inspectFolder().catch(console.error);
