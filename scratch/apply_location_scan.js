const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Haversine distance in meters
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

  // Curated Landmarks
  const LANDMARKS = [
    { name: 'Taj Mahal', city: 'Agra', country: 'India', lat: 27.1751, lon: 78.0421, radiusMeters: 1600 },
    { name: 'Agra Fort', city: 'Agra', country: 'India', lat: 27.1795, lon: 78.0211, radiusMeters: 1400 },
    { name: "Humayun's Tomb", city: 'Delhi', country: 'India', lat: 28.5933, lon: 77.2507, radiusMeters: 1200 },
    { name: 'Safdarjung Tomb & Lodhi', city: 'Delhi', country: 'India', lat: 28.5994, lon: 77.2058, radiusMeters: 1400 },
    { name: 'Red Fort', city: 'Delhi', country: 'India', lat: 28.6562, lon: 77.2410, radiusMeters: 1300 }
  ];

  const CITIES = [
    { name: 'Delhi', lat: 28.6139, lon: 77.2090, radiusKm: 35 },
    { name: 'Agra', lat: 27.1767, lon: 78.0081, radiusKm: 25 }
  ];

  function lookupCoordinates(lat, lon) {
    if (lat === null || lon === null || typeof lat !== 'number' || typeof lon !== 'number') return null;
    for (const lm of LANDMARKS) {
      const d = getHaversineDistanceMeters(lat, lon, lm.lat, lm.lon);
      if (d <= lm.radiusMeters) {
        return { city: lm.city, landmark: lm.name, locationName: `${lm.city} • ${lm.name}` };
      }
    }
    for (const c of CITIES) {
      const d = getHaversineDistanceMeters(lat, lon, c.lat, c.lon) / 1000;
      if (d <= c.radiusKm) {
        return { city: c.name, locationName: c.name };
      }
    }
    return null;
  }

  const allPhotos = db.exec(`
    SELECT p.id, p.filename, p.created_at, e.gps_lat, e.gps_lon
    FROM photos p
    LEFT JOIN exif_data e ON p.id = e.photo_id
    WHERE p.is_trashed = 0
    ORDER BY p.created_at ASC
  `)[0]?.values || [];

  const tagged = allPhotos.map(([id, filename, created_at, lat, lon]) => {
    const geo = lookupCoordinates(lat, lon);
    return {
      id,
      filename,
      created_at,
      lat,
      lon,
      city: geo?.city || null,
      landmark: geo?.landmark || null,
      locationName: geo?.locationName || null,
      isAnchor: Boolean(geo)
    };
  });

  // Session clustering (3.5 hours on same day)
  const SESSION_MAX_GAP_MS = 3.5 * 3600 * 1000;
  const timestamped = tagged.filter(t => t.created_at).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const sessions = [];
  let currentSession = [];

  for (const item of timestamped) {
    if (currentSession.length === 0) {
      currentSession.push(item);
      continue;
    }
    const prev = currentSession[currentSession.length - 1];
    const prevTime = new Date(prev.created_at).getTime();
    const currTime = new Date(item.created_at).getTime();
    const prevDay = prev.created_at.slice(0, 10);
    const currDay = item.created_at.slice(0, 10);

    if (prevDay === currDay && Math.abs(currTime - prevTime) <= SESSION_MAX_GAP_MS) {
      currentSession.push(item);
    } else {
      sessions.push(currentSession);
      currentSession = [item];
    }
  }
  if (currentSession.length > 0) sessions.push(currentSession);

  // Propagate in sessions
  for (const session of sessions) {
    const anchors = session.filter(s => s.isAnchor && s.locationName);
    if (anchors.length > 0) {
      const dominantLoc = anchors[0].locationName;
      const dominantCity = anchors[0].city;
      const validGps = anchors.filter(a => a.lat !== null && a.lon !== null);
      const avgLat = validGps.length > 0 ? validGps.reduce((sum, a) => sum + a.lat, 0) / validGps.length : null;
      const avgLon = validGps.length > 0 ? validGps.reduce((sum, a) => sum + a.lon, 0) / validGps.length : null;

      for (const item of session) {
        if (!item.locationName) {
          item.locationName = dominantLoc;
          item.city = dominantCity;
          item.lat = avgLat;
          item.lon = avgLon;
          item.isInferred = true;
        }
      }
    }
  }

  // Day-level propagation
  const dayAnchorsMap = {};
  for (const item of timestamped) {
    if (item.city && item.isAnchor) {
      const day = item.created_at.slice(0, 10);
      if (!dayAnchorsMap[day]) dayAnchorsMap[day] = new Set();
      dayAnchorsMap[day].add(item.city);
    }
  }

  for (const [day, cities] of Object.entries(dayAnchorsMap)) {
    if (cities.size === 1) {
      const city = Array.from(cities)[0];
      const dayItems = timestamped.filter(t => t.created_at.slice(0, 10) === day);
      const gpsItems = dayItems.filter(t => t.lat !== null && t.lon !== null);
      const dayAvgLat = gpsItems.length > 0 ? gpsItems.reduce((s, i) => s + i.lat, 0) / gpsItems.length : null;
      const dayAvgLon = gpsItems.length > 0 ? gpsItems.reduce((s, i) => s + i.lon, 0) / gpsItems.length : null;

      for (const item of dayItems) {
        if (!item.locationName) {
          item.locationName = city;
          item.city = city;
          item.lat = dayAvgLat;
          item.lon = dayAvgLon;
          item.isInferred = true;
        }
      }
    }
  }

  // Apply to DB
  let updatedCount = 0;
  for (const item of tagged) {
    if (item.locationName) {
      db.run('UPDATE photos SET location_name = ? WHERE id = ?', [item.locationName, item.id]);
      if (item.lat !== null && item.lon !== null) {
        db.run(`
          INSERT INTO exif_data (photo_id, gps_lat, gps_lon)
          VALUES (?, ?, ?)
          ON CONFLICT(photo_id) DO UPDATE SET
            gps_lat = COALESCE(exif_data.gps_lat, excluded.gps_lat),
            gps_lon = COALESCE(exif_data.gps_lon, excluded.gps_lon)
        `, [item.id, item.lat, item.lon]);
      }
      updatedCount++;
    } else {
      db.run('UPDATE photos SET location_name = NULL WHERE id = ?', [item.id]);
    }
  }

  const outBuf = Buffer.from(db.export());
  fs.writeFileSync(dbPath, outBuf);
  console.log(`Saved updated database to ${dbPath}! Total photos placed: ${updatedCount}`);

  // Summary
  const folderDist = db.exec(`
    SELECT location_name, count(*) 
    FROM photos 
    WHERE location_name IS NOT NULL 
    GROUP BY location_name 
    ORDER BY count(*) DESC
  `);
  console.log('Location distribution in DB:', JSON.stringify(folderDist[0]?.values, null, 2));
});
