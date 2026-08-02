const express = require('express');
const request = require('supertest');

jest.mock('./users.service');
const usersService = require('./users.service');

const usersRouter = require('./users');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/famban/users', usersRouter);
  return app;
}

describe('users router', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, FAMBAN_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('GET /users does not require an API key', async () => {
    usersService.listUsers.mockResolvedValue([{ name: 'Connor' }]);

    const res = await request(buildApp()).get('/api/famban/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1, users: [{ name: 'Connor' }] });
  });

  test('POST /users without an API key is rejected before reaching the service', async () => {
    const res = await request(buildApp())
      .post('/api/famban/users')
      .send({ name: 'Connor' });

    expect(res.status).toBe(401);
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  test('POST /users with the wrong API key is rejected', async () => {
    const res = await request(buildApp())
      .post('/api/famban/users')
      .set('x-api-key', 'wrong-key')
      .send({ name: 'Connor' });

    expect(res.status).toBe(401);
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  test('POST /users with the correct API key reaches the service and returns 201', async () => {
    usersService.createUser.mockResolvedValue({ _id: '1', name: 'Connor' });

    const res = await request(buildApp())
      .post('/api/famban/users')
      .set('x-api-key', 'test-key')
      .send({ name: 'Connor', email: 'connor@example.com' });

    expect(res.status).toBe(201);
    expect(usersService.createUser).toHaveBeenCalledWith({
      name: 'Connor',
      email: 'connor@example.com',
    });
    expect(res.body.user).toEqual({ _id: '1', name: 'Connor' });
  });

  test('a service-thrown app error is translated to its status/code', async () => {
    const err = new Error('User name is required');
    err.code = 'USER_NAME_REQUIRED';
    err.status = 400;
    usersService.createUser.mockRejectedValue(err);

    const res = await request(buildApp())
      .post('/api/famban/users')
      .set('x-api-key', 'test-key')
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'USER_NAME_REQUIRED',
      message: 'User name is required',
    });
  });

  test('PATCH /users/:id requires the API key', async () => {
    const res = await request(buildApp())
      .patch('/api/famban/users/507f1f77bcf86cd799439011')
      .send({ active: false });

    expect(res.status).toBe(401);
    expect(usersService.updateUser).not.toHaveBeenCalled();
  });
});
