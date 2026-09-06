const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const p = path.join(process.env.APPDATA, 'photosort', 'photovault.db');

function euclidean(d1, d2) {
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync(p));
  const peopleRes = db.exec(`
    SELECT p.id, p.name, p.cover_photo_id, p.cover_face_base64, p.is_favorite,
           COUNT(pp.photo_id) as photo_count
    FROM people p
    LEFT JOIN photo_people pp ON p.id = pp.person_id
    GROUP BY p.id
  `);
  const people = peopleRes[0].values.map(r => ({
    id: r[0], name: r[1], cover_photo_id: r[2], cover_face_base64: r[3], is_favorite: r[4], photo_count: r[5]
  }));

  const faceRows = db.exec('SELECT id, person_id, descriptor FROM face_descriptors')[0].values;
  const descriptorsByPerson = new Map();
  for (const f of faceRows) {
    try {
      const desc = JSON.parse(f[2]);
      if (!descriptorsByPerson.has(f[1])) descriptorsByPerson.set(f[1], []);
      descriptorsByPerson.get(f[1]).push(desc);
    } catch(e) {}
  }

  function getSamplePhotos(personId) {
    const res = db.exec(`
      SELECT ph.id, ph.file_path, ph.thumbnail_path, ph.preview_path
      FROM photos ph
      INNER JOIN photo_people pp ON ph.id = pp.photo_id
      WHERE pp.person_id = ${personId} AND ph.is_trashed = 0
      ORDER BY ph.created_at DESC
      LIMIT 3
    `);
    if (!res.length || !res[0].values) return [];
    return res[0].values.map(r => ({ id: r[0], file_path: r[1], thumbnail_path: r[2], preview_path: r[3] }));
  }

  const suggestions = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      let pA = people[i];
      let pB = people[j];
      const d1s = descriptorsByPerson.get(pA.id) || [];
      const d2s = descriptorsByPerson.get(pB.id) || [];
      if (!d1s.length || !d2s.length) continue;

      let minDist = 1.0;
      let sumDist = 0;
      let count = 0;
      for (const d1 of d1s) {
        for (const d2 of d2s) {
          const dist = euclidean(d1, d2);
          if (dist < minDist) minDist = dist;
          sumDist += dist;
          count++;
        }
      }
      const avgDist = sumDist / count;
      const effDist = (d1s.length > 2 && d2s.length > 2) ? (0.65 * minDist + 0.35 * avgDist) : minDist;

      if (minDist <= 0.44 || effDist <= 0.48) {
        let confidence;
        if (effDist <= 0.32) {
          confidence = 99;
        } else if (effDist <= 0.48) {
          confidence = Math.round(99 - ((effDist - 0.32) / (0.48 - 0.32)) * 24);
        } else {
          confidence = Math.max(50, Math.round(75 - ((effDist - 0.48) / 0.12) * 25));
        }

        // Prioritize: named person > unknown, higher photo count > lower photo count
        const aIsCustom = pA.name && !pA.name.startsWith('Unknown Person');
        const bIsCustom = pB.name && !pB.name.startsWith('Unknown Person');

        if ((!aIsCustom && bIsCustom) || (aIsCustom === bIsCustom && pB.photo_count > pA.photo_count)) {
          const tmp = pA;
          pA = pB;
          pB = tmp;
        }

        suggestions.push({
          personA: pA,
          personB: pB,
          confidence,
          distance: Number(minDist.toFixed(4)),
          samplePhotosA: getSamplePhotos(pA.id),
          samplePhotosB: getSamplePhotos(pB.id)
        });
      }
    }
  }
  suggestions.sort((a, b) => b.confidence - a.confidence);

  console.log('Generated Suggestions Count:', suggestions.length);
  suggestions.slice(0, 10).forEach(s => {
    console.log(`${s.confidence}% Match (dist: ${s.distance}): Primary #${s.personA.id} (${s.personA.name}, ${s.personA.photo_count} photos) <--- Secondary #${s.personB.id} (${s.personB.name}, ${s.personB.photo_count} photos) | Samples: A=${s.samplePhotosA.length}, B=${s.samplePhotosB.length}`);
  });
});
