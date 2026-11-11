// Піддомен «Обговорення» (допоміжний)
// Сутності: CommentThread, Comment

class Comment {
  constructor({ id, authorId, authorNickname, text, createdAt = new Date() }) {
    if (!text || text.length > 1000) throw new Error('Коментар має бути від 1 до 1000 символів'); // 400
    this.id = id;
    this.authorId = authorId;             // автор коментаря (User.id)
    this.authorNickname = authorNickname;
    this.text = text;
    this.createdAt = createdAt;
  }
}

// Усі коментарі під одним матеріалом
class CommentThread {
  constructor({ materialId, materialAuthorId }) {
    this.materialId = materialId;
    this.materialAuthorId = materialAuthorId; // кому надіслати сповіщення про новий коментар
    this.comments = [];
    this.closed = false;
  }

  addComment(user, text) {
    if (!user || !user.canPublish()) throw new Error('Коментувати можуть лише зареєстровані'); // 401
    if (this.closed) throw new Error('Матеріал видалено, коментарі закрито'); // 404
    const comment = new Comment({
      id: this.comments.length + 1,
      authorId: user.id,
      authorNickname: user.nickname,
      text,
    });
    this.comments.push(comment);
    return comment;
  }

  // Чи треба повідомити автора матеріалу (сам собі сповіщення не надсилає)
  shouldNotifyAuthor(comment) {
    return comment.authorId !== this.materialAuthorId;
  }

  // Викликається, коли матеріал видалили
  close() {
    this.closed = true;
  }

  list() {
    return [...this.comments];
  }
}

module.exports = { CommentThread, Comment };
