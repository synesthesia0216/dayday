// Day-Day 观星台 — 开发用静态服务器
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3099;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/data', express.static(path.join(__dirname, 'data')));

app.listen(PORT, () => {
  console.log(`Day-Day 观星台 → http://localhost:${PORT}`);
});
