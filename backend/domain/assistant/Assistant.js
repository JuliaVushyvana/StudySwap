// Піддомен «AI-помічник» (загальний, етап «Пізніше»)
// Сутності: AssistantQuestion, AssistantAnswer

class AssistantQuestion {
  constructor({ userId, text }) {
    if (!text || text.length > 1000) throw new Error('Питання від 1 до 1000 символів'); // 400
    this.userId = userId;
    this.text = text;
  }
}

class AssistantAnswer {
  constructor({ text, suggestedMaterialIds = [] }) {
    this.text = text;
    this.suggestedMaterialIds = suggestedMaterialIds; // Material.id
  }

  hasSuggestions() {
    return this.suggestedMaterialIds.length > 0;
  }
}

module.exports = { AssistantQuestion, AssistantAnswer };
