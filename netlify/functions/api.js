const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

// Initialise la base au premier appel
async function initDB(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS quiz_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const client = await pool.connect();
  try {
    await initDB(client);

    const { action, key, value } = JSON.parse(event.body || "{}");

    // GET — lire une valeur
    if (action === "get") {
      const r = await client.query(
        "SELECT value FROM quiz_data WHERE key = $1",
        [key]
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ value: r.rows[0]?.value ?? null }),
      };
    }

    // SET — écrire une valeur (upsert)
    if (action === "set") {
      await client.query(
        `INSERT INTO quiz_data (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // GET_ALL — lire toutes les données d'un coup au chargement
    if (action === "get_all") {
      const r = await client.query("SELECT key, value FROM quiz_data");
      const data = {};
      r.rows.forEach((row) => { data[row.key] = row.value; });
      return { statusCode: 200, headers, body: JSON.stringify({ data }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };

  } catch (err) {
    console.error("DB error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  } finally {
    client.release();
  }
};
