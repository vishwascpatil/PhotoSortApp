const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');

const MEME_PATTERNS = [
  /\bpov[:\s]/i,
  /\b(me when|when you|when the|nobody:|no one:|literally no one:)\b/i,
  /\b(bro really|bro thinks|mfw|tfw|my honest reaction|my reaction to)\b/i,
  /\b(wait for it|swipe left|tag a friend|relatable)\b/i,
  /\b(lmao|rofl|bruh|ngl|tbh|smh|wtf|stfu|fr fr|no cap)\b/i,
  /\b(like and share|follow for more|comment below|link in bio|double tap|share this)\b/i,
  /\br\/[a-zA-Z0-9_]{3,}\b/i,
  /\b@[a-zA-Z0-9_]{3,}\b/i,
  /\b(tiktok|instagram|9gag|ifunny|memedroid|reddit|tweet|retweet|upvote|downvote)\b/i,
  /\b(verify your number|enter the 6-digit code|resend code in|share your ticket)\b/i
];

async function main() {
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'photosort', 'photovault.db');
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const res = db.exec("SELECT id, filename, extracted_text FROM photos WHERE id = 40918");
  const text = res[0].values[0][2];
  const lower = text.toLowerCase();

  for (const pat of MEME_PATTERNS) {
    if (pat.test(lower)) {
      console.log('Matched meme pattern:', pat);
      const m = lower.match(pat);
      console.log('Matched substring:', m[0]);
    }
  }
}
main();
