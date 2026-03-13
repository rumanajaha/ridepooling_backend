import { randomUUID } from 'crypto';

export const requestContext = (req, res, next) => {
  const headerRequestId = req.headers['x-request-id'];
  const requestId = typeof headerRequestId === 'string' && headerRequestId.trim()
    ? headerRequestId.trim()
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export default requestContext;
