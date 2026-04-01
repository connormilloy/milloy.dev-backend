const express = require('express');
const app = express();
const { logWithTimestamp } = require('./utils/logwithTimestamp');
const cors = require('cors');

const lorcana = require('./routes/lorcana');
const trains = require('./routes/trains');
const darts = require('./routes/darts');

app.use(cors());
app.set('trust proxy', true);
app.use(express.json());

app.use('/api/lorcana', lorcana);
app.use('/api/trains', trains);
app.use('/api/darts', darts);


app.listen(5555, () => {
  logWithTimestamp('Server started on port 5555!');
});

