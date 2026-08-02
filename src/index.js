const express = require('express');
const app = express();
const { logWithTimestamp } = require('./utils/logwithTimestamp');
const cors = require('cors');
const { initDartsDB } = require('./routes/darts/database/init');
const { connectMongo } = require('./database/mongo');


app.use(cors());
app.set('trust proxy', true);
app.use(express.json());

async function startServer() {
  await initDartsDB();
  await connectMongo();

  // Require route modules after DB init so their DB-backed modules can
  // prepare statements against existing tables.
  const lorcana = require('./routes/lorcana');
  const trains = require('./routes/trains');
  const darts = require('./routes/darts');

  app.use('/api/lorcana', lorcana);
  app.use('/api/trains', trains);
  app.use('/api/darts', darts);


  app.listen(5555, () => {
    logWithTimestamp('Server started on port 5555!');
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
