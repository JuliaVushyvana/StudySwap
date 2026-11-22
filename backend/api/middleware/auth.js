// Визначає користувача за заголовком Authorization: Bearer <JWT>.
// Сам вхід не вимагає: чи потрібен користувач, вирішує use-case у service/.

const { setRequestAttributes } = require('./telemetry');

function authenticate(accessService) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    req.token = scheme === 'Bearer' && token ? token : null; // потрібен для POST /auth/logout
    req.user = req.token ? accessService.authenticate(req.token) : null;
    setRequestAttributes(req, { 'user.id': req.user?.id });
    next();
  };
}

module.exports = { authenticate };
