const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const photos = db.exec(`
    SELECT p.id, p.filename, p.created_at, e.gps_lat, e.gps_lon, p.source_folder_path
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
    WHERE p.is_trashed = 0
    ORDER BY p.created_at ASC
  `)[0]?.values || [];

  console.log(`Loaded ${photos.length} photos`);

  // Landmark distance check
  function getHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function resolveGps(lat, lon) {
    if (!lat || !lon) return null;
    // Taj Mahal
    if (getHaversineDistanceMeters(lat, lon, 27.1751, 78.0421) <= 1800) {
      return { city: 'Agra', landmark: 'Taj Mahal', locationName: 'Agra • Taj Mahal' };
    }
    // Agra Fort
    if (getHaversineDistanceMeters(lat, lon, 27.1795, 78.0211) <= 1500) {
      return { city: 'Agra', landmark: 'Agra Fort', locationName: 'Agra • Agra Fort' };
    }
    // Humayun's Tomb
    if (getHaversineDistanceMeters(lat, lon, 28.5933, 77.2507) <= 1400) {
      return { city: 'Delhi', landmark: "Humayun's Tomb", locationName: "Delhi • Humayun's Tomb" };
    }
    // Red Fort
    if (getHaversineDistanceMeters(lat, lon, 28.6562, 77.2410) <= 1400) {
      return { city: 'Delhi', landmark: 'Red Fort', locationName: 'Delhi • Red Fort' };
    }
    // Safdarjung
    if (getHaversineDistanceMeters(lat, lon, 28.5994, 77.2058) <= 1400) {
      return { city: 'Delhi', landmark: 'Safdarjung', locationName: 'Delhi • Safdarjung' };
    }
    // City bounds
    if (getHaversineDistanceMeters(lat, lon, 27.1767, 78.0081) <= 25000) {
      return { city: 'Agra', locationName: 'Agra' };
    }
    if (getHaversineDistanceMeters(lat, lon, 28.6139, 77.2090) <= 35000) {
      return { city: 'Delhi', locationName: 'Delhi' };
    }
    return null;
  }

  // Tag anchors
  const tagged = photos.map(([id, filename, created_at, lat, lon, source_folder]) => {
    const loc = resolveGps(lat, lon);
    return {
      id,
      filename,
      created_at,
      lat,
      lon,
      source_folder,
      locName: loc?.locationName || null,
      city: loc?.city || null,
      landmark: loc?.landmark || null,
      isAnchor: Boolean(loc)
    };
  });

  const anchorCount = tagged.filter(p => p.isAnchor).length;
  console.log(`Anchor photos with GPS resolved: ${anchorCount}`);

  // Temporal Sessions
  const SESSION_MAX_GAP_MS = 3 * 3600 * 1000; // 3 hours
  const sessions = [];
  let currentSession = [];

  for (const p of tagged) {
    if (!p.created_at) continue;
    if (currentSession.length === 0) {
      currentSession.push(p);
      continue;
    }
    const prev = currentSession[currentSession.length - 1];
    const prevTime = new Date(prev.created_at).getTime();
    const currTime = new Date(p.created_at).getTime();
    const sameDay = prev.created_at.slice(0, 10) === p.created_at.slice(0, 10);

    if (sameDay && Math.abs(currTime - prevTime) <= SESSION_MAX_GAP_MS) {
      currentSession.push(p);
    } else {
      sessions.push(currentSession);
      currentSession = [p];
    }
  }
  if (currentSession.length > 0) sessions.push(currentSession);

  console.log(`Identified ${sessions.length} temporal sessions`);

  // Propagation
  let propagatedCount = 0;
  for (const session of sessions) {
    const anchors = session.filter(p => p.isAnchor);
    if (anchors.length > 0) {
      // Find dominant location
      const locCounts = {};
      anchors.forEach(a => { locCounts[a.locName] = (locCounts[a.locName] || 0) + 1; });
      const bestLoc = Object.keys(locCounts).sort((a, b) => locCounts[b] - locCounts[a])[0];
      const anchorCity = anchors[0].city;
      const avgLat = anchors.reduce((acc, a) => acc + (a.lat || 0), 0) / anchors.filter(a => a.lat).length;
      const avgLon = anchors.reduce((acc, a) => acc + (a.lon || 0), 0) / anchors.filter(a => a.lon).length;

      for (const p of session) {
        if (!p.locName) {
          p.locName = bestLoc;
          p.city = anchorCity;
          p.inferredLat = avgLat;
          p.inferredLon = avgLon;
          p.inferred = true;
          propagatedCount++;
        }
      }
    }
  }

  console.log(`Propagated location to ${propagatedCount} companion photos!`);

  // Calculate Place Folders
  const folders = {};
  for (const p of tagged) {
    if (!p.locName) continue;
    const year = p.created_at ? p.created_at.slice(0, 4) : '';
    const folderName = `${p.city} ${year}`.trim();
    if (!folders[folderName]) {
      folders[folderName] = {
        name: folderName,
        city: p.city,
        year,
        photos: [],
        landmarks: new Set()
      };
    }
    folders[folderName].photos.push(p);
    if (p.landmark) folders[folderName].landmarks.add(p.landmark);
  }

  console.log('--- Resulting Place Folders ---');
  for (const f of Object.values(folders)) {
    console.log(`Folder: "${f.name}" | Total Photos: ${f.photos.length} | Landmarks: [${Array.from(f.landmarks).join(', ')}]`);
  }
});
