// Визначає користувача за заголовком Authorization: Bearer <токен>.
// Сам вхід не вимагає: чи потрібен користувач, вирішує use-case у service/.

function authenticate(accessService) {
  return (req, res, next) => {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    req.user = scheme === 'Bearer' ? accessService.authenticate(token) : null;
    next();
  };
}

module.exports = { authenticate };
