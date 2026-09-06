const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const exifReader = require('exif-reader');

async function inspectImgFiles() {
  const folder = 'C:\\Users\\vishw\\Downloads\\17 pro max-backup';
  const files = fs.readdirSync(folder).filter(f => f.toUpperCase().startsWith('IMG_'));
  console.log(`Analyzing ${files.length} IMG_ files...`);

  let withExif = 0;
  let withGps = 0;
  const gpsCoords = [];

  function convertDMSToDecimal(dms, ref) {
    if (!dms || !Array.isArray(dms) || dms.length !== 3) return undefined;
    let decimal = dms[0] + (dms[1] / 60) + (dms[2] / 3600);
    if (ref && (ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W')) {
      decimal = -decimal;
    }
    return decimal;
  }

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const full = path.join(folder, f);
    try {
      const meta = await sharp(full).metadata();
      if (meta && meta.exif) {
        withExif++;
        const parsed = exifReader(meta.exif);
        const gpsObj = parsed.gps || {};
        const lat = convertDMSToDecimal(gpsObj.GPSLatitude, gpsObj.GPSLatitudeRef);
        const lon = convertDMSToDecimal(gpsObj.GPSLongitude, gpsObj.GPSLongitudeRef);
        const dt = parsed.photo?.DateTimeOriginal || parsed.photo?.DateTimeDigitized;

        if (lat !== undefined && lon !== undefined) {
          withGps++;
          gpsCoords.push({ file: f, lat, lon, date: dt });
        }
      }
    } catch (e) {}
  }

  console.log(`IMG_ files with EXIF: ${withExif} / ${files.length}`);
  console.log(`IMG_ files with GPS: ${withGps} / ${files.length}`);
  console.log('Sample GPS from IMG_ files:', JSON.stringify(gpsCoords.slice(0, 15), null, 2));

  // Cluster GPS
  const clusters = {};
  for (const g of gpsCoords) {
    const key = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
    if (!clusters[key]) clusters[key] = { count: 0, lat: g.lat, lon: g.lon, sample: g.file, dates: [] };
    clusters[key].count++;
    if (g.date) clusters[key].dates.push(g.date);
  }
  console.log('GPS Clusters:', JSON.stringify(clusters, null, 2));
}

inspectImgFiles().catch(console.error);
