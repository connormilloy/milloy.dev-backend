const express = require('express');
const app = express();

const lorcana = require('./routes/lorcana');
const trains = require('./routes/trains');

app.use('/api2/lorcana', lorcana);
app.use('/api2/trains', trains);

app.listen(5555, () => {
  console.log('Server is running on port 5555');
});

