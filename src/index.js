const express = require('express');
const app = express();

const lorcana = require('./routes/lorcana');
const trains = require('./routes/trains');

app.use('/lorcana', lorcana);
app.use('/trains', trains);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

