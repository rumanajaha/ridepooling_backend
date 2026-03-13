export const validateRequest = (schema) => (req, res, next) => {
  const payload = {
    body: req.body ?? {},
    params: req.params ?? {},
    query: req.query ?? {},
  };

  const result = schema.safeParse(payload);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return res.status(400).json({
      success: false,
      message: firstIssue?.message || 'Invalid request payload',
      field: firstIssue?.path?.join('.') || undefined,
    });
  }

  req.body = result.data.body;
  Object.assign(req.params, result.data.params);
  Object.assign(req.query, result.data.query);
  return next();
};
