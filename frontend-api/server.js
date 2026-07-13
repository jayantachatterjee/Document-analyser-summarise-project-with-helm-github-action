const express = require('express');
const { createClient } = require('redis');
const { Pool } = require('pg');
const path = require('path'); // <-- 1. Import path module at the top

const app = express();
app.use(express.json());

// 2. Use an absolute path to ensure Docker finds the folder accurately
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const redisClient = createClient({ url: process.env.REDIS_URL });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

redisClient.on('error', err => console.error('Redis Client Error:', err));

// 3. Explicit fallback route for the home layout
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Submit a document for summarization
app.post('/api/analyze', async (req, res) => {
    const { documentText } = req.body;
    if (!documentText) return res.status(400).json({ error: "Missing documentText" });

    try {
        const dbRes = await pool.query(
            'INSERT INTO summaries(content, status) VALUES($1, $2) RETURNING id',
            [documentText, 'PENDING']
        );
        const jobId = dbRes.rows[0].id;

        await redisClient.rPush('ai_tasks', JSON.stringify({ jobId, text: documentText }));
        res.status(202).json({ jobId, status: 'PENDING', message: 'Job queued successfully.' });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'Database or Queue error' });
    }
});

// Fetch summary result
app.get('/api/result/:id', async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    if (isNaN(jobId)) {
        return res.status(400).json({ error: 'Invalid Job ID format' });
    }

    try {
        const dbRes = await pool.query(
            'SELECT id, content, summary, status FROM summaries WHERE id = $1', 
            [jobId]
        );
        if (dbRes.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.json(dbRes.rows[0]);
    } catch (err) {
        console.error('Database query crash caught:', err.message);
        return res.status(500).json({ error: 'Database fetch error', details: err.message });
    }
});

app.get('/health', (req, res) => res.status(200).send('OK'));

async function connectWithRetry() {
    let retries = 5;
    while (retries) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS summaries (
                    id SERIAL PRIMARY KEY,
                    content TEXT,
                    summary TEXT,
                    status VARCHAR(20),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('Successfully connected to PostgreSQL.');
            break;
        } catch (err) {
            console.error(`Postgres connection failed. Retries left: ${retries - 1}`);
            retries -= 1;
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

async function start() {
    await redisClient.connect();
    await connectWithRetry();
    app.listen(PORT, '0.0.0.0', () => console.log(`API running on port ${PORT}`));
}

start().catch(console.error);