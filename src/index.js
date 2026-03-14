const express = require('express');
const app = express();
const { logWithTimestamp } = require('./utils/logwithTimestamp');
const cors = require('cors');

const lorcana = require('./routes/lorcana');
const trains = require('./routes/trains');
const recipes = require('./routes/recipes');
const { connectDB } = require('./utils/db');

app.use(cors());
app.set('trust proxy', true);

app.use('/api/lorcana', lorcana);
app.use('/api/trains', trains);
app.use('/api/recipes', recipes);

async function startServer() {
  await connectDB();

  app.listen(5555, () => {
    logWithTimestamp('Server started on port 5555!');
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
