// Піддомен «Профілі» (допоміжний)
// UserProfile власних даних не має: збирається з User і його матеріалів.

class UserProfile {
  constructor({ nickname, avatarUrl = null, materials = [] }) {
    this.nickname = nickname;
    this.avatarUrl = avatarUrl;
    this.materials = materials; // лише власні опубліковані матеріали
  }

  // Зібрати профіль з даних двох інших контекстів
  static build(user, catalog) {
    return new UserProfile({
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      materials: catalog.byAuthor(user.id),
    });
  }

  materialsCount() {
    return this.materials.length;
  }
}

module.exports = { UserProfile };
