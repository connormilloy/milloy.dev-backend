const express = require('express');
const {
  listCards,
  getCardById,
  createCard,
  updateCard,
  setCardStatus,
  setCardAssignees,
  setCardTags,
  addComment,
  editComment,
  deleteComment,
} = require('./cards.service');
const { requireSession } = require('../../shared/requireSession');
const { sendRouteError } = require('../../shared/errors');
const { fambanRateLimiter } = require('../../shared/rateLimiters');

const router = express.Router();

router.get('/', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const cards = await listCards({
      boardId: req.query.boardId,
      columnId: req.query.columnId,
      status: req.query.status,
      assignee: req.query.assignee,
      tag: req.query.tag,
    });

    return res.status(200).json({ count: cards.length, cards });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch cards');
  }
});

router.get('/:id', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const card = await getCardById(req.params.id);

    return res.status(200).json(card);
  } catch (err) {
    return sendRouteError(res, err, 'Failed to fetch card');
  }
});

router.post('/', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const { boardId, columnId, title, description, assignees, tags } = req.body;
    const card = await createCard({
      boardId,
      columnId,
      title,
      description,
      assignees,
      tags,
    });

    return res.status(201).json({ message: 'Card created successfully', card });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to create card');
  }
});

router.patch('/:id', fambanRateLimiter, requireSession, async (req, res) => {
  try {
    const { title, description, columnId, order } = req.body;
    const card = await updateCard(req.params.id, {
      title,
      description,
      columnId,
      order,
    });

    return res.status(200).json({ message: 'Card updated successfully', card });
  } catch (err) {
    return sendRouteError(res, err, 'Failed to update card');
  }
});

router.post(
  '/:id/status',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const card = await setCardStatus(req.params.id, req.body.status);

      return res
        .status(200)
        .json({ message: 'Card status updated successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to update card status');
    }
  }
);

router.post(
  '/:id/assign',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const card = await setCardAssignees(req.params.id, req.body.assigneeIds);

      return res
        .status(200)
        .json({ message: 'Card assignees updated successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to update card assignees');
    }
  }
);

router.post(
  '/:id/tags',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const card = await setCardTags(req.params.id, req.body.tagIds);

      return res
        .status(200)
        .json({ message: 'Card tags updated successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to update card tags');
    }
  }
);

router.post(
  '/:id/comments',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const { text } = req.body;
      const card = await addComment(req.params.id, {
        userId: req.fambanUser.userId,
        text,
      });

      return res
        .status(201)
        .json({ message: 'Comment added successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to add comment');
    }
  }
);

router.patch(
  '/:id/comments/:commentId',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const { text } = req.body;
      const card = await editComment(req.params.id, req.params.commentId, {
        userId: req.fambanUser.userId,
        text,
      });

      return res
        .status(200)
        .json({ message: 'Comment updated successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to update comment');
    }
  }
);

router.delete(
  '/:id/comments/:commentId',
  fambanRateLimiter,
  requireSession,
  async (req, res) => {
    try {
      const card = await deleteComment(
        req.params.id,
        req.params.commentId,
        req.fambanUser.userId
      );

      return res
        .status(200)
        .json({ message: 'Comment deleted successfully', card });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to delete comment');
    }
  }
);

module.exports = router;
