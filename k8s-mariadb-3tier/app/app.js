// simple express app that connects to MariaDB using env vars
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  const dbHost = process.env.DB_HOST || 'mariadb';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || 'password';
  const dbName = process.env.DB_NAME || 'appdb';
  let conn;
  try {
    conn = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      database: dbName,
    });
    const [rows] = await conn.query('SELECT NOW() as nowtime');
    res.send(`Hello from Node.js App — DB time: ${rows[0].nowtime}\n`);
  } catch (err) {
    console.error('DB error', err);
    res.status(500).send('Cannot connect to DB: ' + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});