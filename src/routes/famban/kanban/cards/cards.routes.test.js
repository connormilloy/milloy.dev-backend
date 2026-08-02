const express = require('express');
const request = require('supertest');

jest.mock('./cards.service');
const cardsService = require('./cards.service');

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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, FAMBAN_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('GET /cards does not require an API key', async () => {
    cardsService.listCards.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/famban/kanban/cards');

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
  ])('%s %s rejects requests without an API key', async (method, path) => {
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
      .set('x-api-key', 'test-key')
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
      .set('x-api-key', 'test-key')
      .send({ assigneeIds: ['u1'] });

    expect(res.status).toBe(200);
    expect(cardsService.setCardAssignees).toHaveBeenCalledWith(cardId, ['u1']);
  });

  test('POST /cards/:id/comments returns 201 and forwards userId/text', async () => {
    cardsService.addComment.mockResolvedValue({ _id: cardId, comments: [] });

    const res = await request(buildApp())
      .post(`/api/famban/kanban/cards/${cardId}/comments`)
      .set('x-api-key', 'test-key')
      .send({ userId: 'u1', text: 'On it' });

    expect(res.status).toBe(201);
    expect(cardsService.addComment).toHaveBeenCalledWith(cardId, {
      userId: 'u1',
      text: 'On it',
    });
  });

  test('a not-found error from the service becomes a 404', async () => {
    const err = new Error('Card not found');
    err.code = 'CARD_NOT_FOUND';
    err.status = 404;
    cardsService.getCardById.mockRejectedValue(err);

    const res = await request(buildApp()).get(
      `/api/famban/kanban/cards/${cardId}`
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'CARD_NOT_FOUND',
      message: 'Card not found',
    });
  });
});
