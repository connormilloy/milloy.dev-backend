const express = require('express');
const request = require('supertest');

jest.mock('./cards.service');
const cardsService = require('./cards.service');

const { createSessionToken } = require('../../shared/session');
const cardsRouter = require('./cards');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/famban/kanban/cards', cardsRouter);
  return app;
}

describe('cards router', () => {
  const OLD_ENV = process.env;
  const cardId = '507f1f77bcf86cd799439011';
  const sessionUserId = '507f191e810c19729de860ea';
  let authHeader;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, FAMBAN_SESSION_SECRET: 'test-secret' };
    const token = createSessionToken({
      userId: sessionUserId,
      email: 'connor@example.com',
    });
    authHeader = `Bearer ${token}`;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('GET /cards requires a session', async () => {
    const res = await request(buildApp()).get('/api/famban/kanban/cards');

    expect(res.status).toBe(401);
    expect(cardsService.listCards).not.toHaveBeenCalled();
  });

  test('GET /cards returns data for a valid session', async () => {
    cardsService.listCards.mockResolvedValue([]);

    const res = await request(buildApp())
      .get('/api/famban/kanban/cards')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(cardsService.listCards).toHaveBeenCalled();
  });

  test.each([
    ['post', `/api/famban/kanban/cards`],
    ['patch', `/api/famban/kanban/cards/${cardId}`],
    ['post', `/api/famban/kanban/cards/${cardId}/status`],
    ['post', `/api/famban/kanban/cards/${cardId}/assign`],
    ['post', `/api/famban/kanban/cards/${cardId}/tags`],
    ['post', `/api/famban/kanban/cards/${cardId}/comments`],
  ])('%s %s rejects requests without a session', async (method, path) => {
    const res = await request(buildApp())[method](path).send({});

    expect(res.status).toBe(401);
  });

  test('POST /cards/:id/status forwards the status to the service', async () => {
    cardsService.setCardStatus.mockResolvedValue({
      _id: cardId,
      status: 'done',
    });

    const res = await request(buildApp())
      .post(`/api/famban/kanban/cards/${cardId}/status`)
      .set('Authorization', authHeader)
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(cardsService.setCardStatus).toHaveBeenCalledWith(cardId, 'done');
  });

  test('POST /cards/:id/assign forwards assigneeIds to the service', async () => {
    cardsService.setCardAssignees.mockResolvedValue({
      _id: cardId,
      assignees: ['u1'],
    });

    const res = await request(buildApp())
      .post(`/api/famban/kanban/cards/${cardId}/assign`)
      .set('Authorization', authHeader)
      .send({ assigneeIds: ['u1'] });

    expect(res.status).toBe(200);
    expect(cardsService.setCardAssignees).toHaveBeenCalledWith(cardId, ['u1']);
  });

  test('POST /cards/:id/comments uses the session identity for userId, ignoring any client-supplied value', async () => {
    cardsService.addComment.mockResolvedValue({ _id: cardId, comments: [] });

    const res = await request(buildApp())
      .post(`/api/famban/kanban/cards/${cardId}/comments`)
      .set('Authorization', authHeader)
      .send({ userId: 'attacker-supplied-id', text: 'On it' });

    expect(res.status).toBe(201);
    expect(cardsService.addComment).toHaveBeenCalledWith(cardId, {
      userId: sessionUserId,
      text: 'On it',
    });
  });

  test('a not-found error from the service becomes a 404', async () => {
    const err = new Error('Card not found');
    err.code = 'CARD_NOT_FOUND';
    err.status = 404;
    cardsService.getCardById.mockRejectedValue(err);

    const res = await request(buildApp())
      .get(`/api/famban/kanban/cards/${cardId}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'CARD_NOT_FOUND',
      message: 'Card not found',
    });
  });
});
