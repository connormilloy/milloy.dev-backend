const express = require('express');
const { listTags, createTag, updateTag, deleteTag } = require('./tags.service');
const { requireApiKey } = require('./auth');
const { sendRouteError } = require('./errors');
const { fambanRateLimiter } = require('./rateLimiters');

const router = express.Router();

router.get('/', fambanRateLimiter, async (req, res) => {
  try {
    const tags = await listTags();

    return res.status(200).json({ count: tags.length, tags });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch tags');
  }
});

router.post('/', fambanRateLimiter, requireApiKey, async (req, res) => {
  try {
    const { name, color } = req.body;
    const tag = await createTag({ name, color });

    return res.status(201).json({ message: 'Tag created successfully', tag });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to create tag');
  }
});

router.patch('/:id', fambanRateLimiter, requireApiKey, async (req, res) => {
  try {
    const { name, color } = req.body;
    const tag = await updateTag(req.params.id, { name, color });

    return res.status(200).json({ message: 'Tag updated successfully', tag });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to update tag');
  }
});

router.delete('/:id', fambanRateLimiter, requireApiKey, async (req, res) => {
  try {
    await deleteTag(req.params.id);

    return res.status(200).json({ message: 'Tag deleted successfully' });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to delete tag');
  }
});

module.exports = router;
