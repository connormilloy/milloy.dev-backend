const express = require('express');
const {
  listBoards,
  getBoardById,
  createBoard,
  updateBoard,
  addColumn,
  renameColumn,
  deleteColumn,
} = require('./boards.service');
const { requireSession } = require('../../shared/requireSession');
const { sendRouteError } = require('../../shared/errors');
const { fambanRateLimiter } = require('../../shared/rateLimiters');

const router = express.Router();

router.get('/', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const boards = await listBoards({ includeArchived });

    return res.status(200).json({ count: boards.length, boards });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch boards');
  }
});

router.get('/:id', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const board = await getBoardById(req.params.id);

    return res.status(200).json(board);
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch board');
  }
});

router.post('/', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const { name, description, columns } = req.body;
    const board = await createBoard({ name, description, columns });

    return res
      .status(201)
      .json({ message: 'Board created successfully', board });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to create board');
  }
});

router.patch('/:id', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const { name, description, archived } = req.body;
    const board = await updateBoard(req.params.id, {
      name,
      description,
      archived,
    });

    return res
      .status(200)
      .json({ message: 'Board updated successfully', board });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to update board');
  }
});

router.post(
  '/:id/columns',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const column = await addColumn(req.params.id, req.body.name);

      return res
        .status(201)
        .json({ message: 'Column added successfully', column });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to add column');
    }
  }
);

router.patch(
  '/:id/columns/:columnId',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const column = await renameColumn(
        req.params.id,
        req.params.columnId,
        req.body.name
      );

      return res
        .status(200)
        .json({ message: 'Column renamed successfully', column });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to rename column');
    }
  }
);

router.delete(
  '/:id/columns/:columnId',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      await deleteColumn(req.params.id, req.params.columnId);

      return res.status(200).json({ message: 'Column deleted successfully' });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to delete column');
    }
  }
);

module.exports = router;
