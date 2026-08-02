const { requireApiKey } = require('./auth');

function buildReqRes(headerValue) {
  const req = { header: jest.fn().mockReturnValue(headerValue) };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

describe('requireApiKey', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('500s with SERVER_MISCONFIGURED when FAMBAN_API_KEY is unset', () => {
    delete process.env.FAMBAN_API_KEY;
    const { req, res } = buildReqRes('anything');
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'SERVER_MISCONFIGURED' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when no key is provided', () => {
    process.env.FAMBAN_API_KEY = 'secret';
    const { req, res } = buildReqRes(undefined);
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401s when the wrong key is provided', () => {
    process.env.FAMBAN_API_KEY = 'secret';
    const { req, res } = buildReqRes('wrong');
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() when the key matches', () => {
    process.env.FAMBAN_API_KEY = 'secret';
    const { req, res } = buildReqRes('secret');
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
