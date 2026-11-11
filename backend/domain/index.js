// Єдина точка імпорту доменних моделей StudySwap

module.exports = {
  ...require('./access/User'),
  ...require('./catalog/Material'),
  ...require('./discussion/CommentThread'),
  ...require('./moderation/Report'),
  ...require('./profiles/UserProfile'),
  ...require('./storage/StoredFile'),
  ...require('./notifications/Notification'),
  ...require('./assistant/Assistant'),
};
