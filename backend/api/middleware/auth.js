// Визначає користувача за заголовком Authorization: Bearer <JWT>.
// Сам вхід не вимагає: чи потрібен користувач, вирішує use-case у service/.

function authenticate(accessService) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    req.token = scheme === 'Bearer' && token ? token : null; // потрібен для POST /auth/logout
    req.user = req.token ? accessService.authenticate(req.token) : null;
    next();
  };
}

module.exports = { authenticate };
