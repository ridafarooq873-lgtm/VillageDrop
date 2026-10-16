/**
 * Wrap an async route handler so rejected promises reach the Express error
 * handler instead of crashing the process.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => any} fn
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next)

export default asyncHandler
