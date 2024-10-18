const express = require('express');
const app = express();
const port = 8000;

app.use(express.json());

app.post('/rest/api/3/issue', (req, res) => {
  res.json({ key: 'TEST-123' });
});

app.listen(port, () => {
  console.log(`Mock server running on http://localhost:${port}`);
});
