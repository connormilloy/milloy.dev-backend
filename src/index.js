const express = require('express');
const app = express();
const { logWithTimestamp } = require('./utils/logwithTimestamp');
const cors = require('cors');

const lorcana = require('./routes/lorcana');
const trains = require('./routes/trains');

app.use(cors());
app.set('trust proxy', true);

app.use('/api/lorcana', lorcana);
app.use('/api/trains', trains);


app.listen(5555, () => {
  logWithTimestamp('Server started on port 5555!');
});

