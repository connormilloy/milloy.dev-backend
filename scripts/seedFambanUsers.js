// One-off bootstrap: creates the first famban-users record(s) directly
// against Mongo, bypassing the API. This exists because POST /users now
// requires a logged-in session, and nobody can log in until their email
// already exists as an active user - a chicken-and-egg problem for the
// very first account(s). Once at least one user exists, further family
// members can be added by anyone already logged in via POST /users.
//
// Usage:
//   node scripts/seedFambanUsers.js "User 1" "user@example.com" "User 2" "user2@example.com"

require('dotenv').config();
const { connectMongo, getDb } = require('../src/database/mongo');

async function seed(pairs) {
  await connectMongo();
  const db = getDb();
  const now = new Date();

  for (let i = 0; i < pairs.length; i += 2) {
    const name = pairs[i];
    const email = String(pairs[i + 1] || '')
      .trim()
      .toLowerCase();

    if (!name || !email) {
      console.error(
        `Skipping incomplete pair at position ${i}: (${name}, ${email})`
      );
      continue;
    }

    const result = await db.collection('famban-users').updateOne(
      { email },
      {
        $setOnInsert: { name, email, active: true, createdAt: now },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );

    console.log(
      `${email}: ${result.upsertedCount ? 'created' : 'already existed, left as-is'}`
    );
  }

  process.exit(0);
}

const args = process.argv.slice(2);

if (args.length === 0 || args.length % 2 !== 0) {
  console.error(
    'Usage: node scripts/seedFambanUsers.js "Name" "email@example.com" ["Name 2" "email2@example.com" ...]'
  );
  process.exit(1);
}

seed(args).catch((err) => {
  console.error(err);
  process.exit(1);
});
