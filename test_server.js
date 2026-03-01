const express = require('express');
const app = express();
const PORT = 3002;

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});
