const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'photovault', 'photovault.db');
initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(dbPath));

  const totalPeople = db.exec('SELECT count(*) FROM people')[0]?.values[0][0];
  const totalFaceDesc = db.exec('SELECT count(*) FROM face_descriptors')[0]?.values[0][0];
  const totalPhotoPeople = db.exec('SELECT count(*) FROM photo_people')[0]?.values[0][0];

  console.log('Total People in DB:', totalPeople);
  console.log('Total Face Descriptors in DB:', totalFaceDesc);
  console.log('Total Photo People links:', totalPhotoPeople);

  const peopleList = db.exec(`
    SELECT p.id, p.name, count(pp.photo_id) as photos_count, p.cover_face_base64 IS NOT NULL as has_face_b64
    FROM people p
    LEFT JOIN photo_people pp ON p.id = pp.person_id
    GROUP BY p.id
    ORDER BY photos_count DESC
    LIMIT 30
  `)[0]?.values || [];

  console.log('Sample People:', JSON.stringify(peopleList.slice(0, 15), null, 2));

  // Let's test getMergeSuggestions() logic directly!
  const faces = db.exec('SELECT person_id, descriptor FROM face_descriptors')[0]?.values || [];
  console.log(`Loaded ${faces.length} face descriptors`);

  // Euclidean distance
  function euclideanDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
      const diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  const descriptorsByPerson = new Map();
  for (const [person_id, descStr] of faces) {
    try {
      const desc = JSON.parse(descStr);
      if (!descriptorsByPerson.has(person_id)) descriptorsByPerson.set(person_id, []);
      descriptorsByPerson.get(person_id).push(desc);
    } catch (e) {}
  }

  const peopleIds = Array.from(descriptorsByPerson.keys());
  console.log(`People with descriptors: ${peopleIds.length}`);

  const matches = [];
  for (let i = 0; i < peopleIds.length; i++) {
    for (let j = i + 1; j < peopleIds.length; j++) {
      const p1 = peopleIds[i];
      const p2 = peopleIds[j];
      const descs1 = descriptorsByPerson.get(p1);
      const descs2 = descriptorsByPerson.get(p2);

      let minDistance = 1.0;
      for (const d1 of descs1) {
        for (const d2 of descs2) {
          const dist = euclideanDistance(d1, d2);
          if (dist < minDistance) minDistance = dist;
        }
      }

      // In face-api (ResNet 128D), distance < 0.6 is typically the same person.
      // Euclidean distance 0.4 = ~95% match, 0.5 = ~85% match, 0.6 = ~70% match, 0.7 = ~50% match
      if (minDistance <= 0.75) {
        // Compute cosine / euclidean similarity percentage
        const similarity = Math.max(0, Math.min(100, Math.round((1 - (minDistance / 1.0)) * 100)));
        // Match percentage formula calibrated for 128D face embeddings:
        // 0.35 -> 98%, 0.45 -> 92%, 0.55 -> 82%, 0.65 -> 70%, 0.75 -> 55%
        const matchPercent = Math.max(0, Math.min(100, Math.round(100 - (minDistance * 75))));
        matches.push({ p1, p2, minDistance: minDistance.toFixed(3), matchPercent });
      }
    }
  }

  console.log(`Found ${matches.length} pairs of matching/duplicate people!`);
  console.log('Top matches:', matches.slice(0, 15));
});
