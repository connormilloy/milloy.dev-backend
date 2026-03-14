require('dotenv').config();
const express = require('express');

const router = express.Router();

const { MongoClient } = require('mongodb');
const { pipeline } = require('stream');

const fs = require('fs');
const path = require('path');

const {
  strictRateLimiter,
  relaxedRateLimiter,
} = require('../../utils/rateLimiters');

let db;

router.get('/set-champs', strictRateLimiter, async (req, res) => {
  try {
    const data = fs.readFileSync(
      path.join(__dirname, 'utils', 'events.json'),
      'utf-8'
    );
    const events = JSON.parse(data);

    if (!events || events.length === 0) {
      return res.status(404).json({ error: 'No events found.' });
    }

    res.json(events);
  } catch (err) {
    console.error('Failed to fetch set champs data:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/random-card', relaxedRateLimiter, async (req, res) => {
  try {
    const card = await db
      .collection('lorcana-cards')
      .aggregate([{ $sample: { size: 1 } }])
      .next();
    res.json(card);
  } catch (err) {
    console.error('Failed to fetch random card:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/image-proxy', relaxedRateLimiter, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    console.warn('Missing image URL');
    return res.status(400).send('Missing image URL');
  }

  try {
    const upstreamRes = await fetch(url);

    if (!upstreamRes.ok) {
      console.error(
        `Failed to fetch image from source: ${upstreamRes.status} ${upstreamRes.statusText}`
      );
      return res.status(502).send('Failed to fetch image from source');
    }

    if (!upstreamRes.body) {
      console.error('Response body is null or undefined');
      return res.status(502).send('Invalid image response');
    }

    res.setHeader(
      'Content-Type',
      upstreamRes.headers.get('content-type') || 'application/octet-stream'
    );
    res.setHeader('Access-Control-Allow-Origin', '*');

    pipeline(upstreamRes.body, res, (err) => {
      if (err) {
        console.error('Pipeline failed:', err);
        res.status(500).send('Streaming error');
      }
    });
  } catch (err) {
    console.error('Unexpected error in image proxy:', err);
    res.status(500).send('Unexpected server error');
  }
});

module.exports = router;
