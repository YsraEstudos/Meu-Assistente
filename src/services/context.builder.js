'use strict';

const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

const DEFAULT_MAX_TOKENS = 8192;

class ContextBuilder {
  constructor() {
    this.promptCache = new Map();
  }

  clearCache() {
    this.promptCache.clear();
  }

  getSkillPrompt(activeSkill = 'general', codingLanguage = null) {
    const skill = String(activeSkill || 'general').trim().toLowerCase();
    const language = codingLanguage ? String(codingLanguage).trim().toLowerCase() : '';
    const cacheKey = `${skill}:${language}`;
    if (this.promptCache.has(cacheKey)) return this.promptCache.get(cacheKey);
    const prompt = promptLoader.getSkillPrompt(skill, codingLanguage) || '';
    this.promptCache.set(cacheKey, prompt);
    return prompt;
  }

  build({ text, activeSkill = 'general', codingLanguage = null, historySnapshot = {}, systemPrompt = null, currentMessage = null } = {}) {
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) throw new Error('ContextBuilder requires non-empty text');

    const maxTokens = Number(config.get('performance.contextMaxTokens')) || DEFAULT_MAX_TOKENS;
    const prompt = systemPrompt == null ? this.getSkillPrompt(activeSkill, codingLanguage) : String(systemPrompt || '');
    const source = this._getHistory(historySnapshot);
    const summary = this._getSummary(historySnapshot);
    const contextPrompt = summary
      ? `${prompt}\n\nCOMPACT SESSION SUMMARY:\n${summary}`
      : prompt;
    const currentInput = currentMessage == null ? this._formatUserMessage(cleanText, activeSkill) : String(currentMessage);
    const history = this._fitHistory(source, currentInput, maxTokens, contextPrompt, '', cleanText);
    const contents = history.map((event) => ({
      role: event.role === 'model' ? 'model' : 'user',
      parts: [{ text: event.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: currentInput }] });

    return {
      systemInstruction: contextPrompt ? { parts: [{ text: contextPrompt }] } : undefined,
      contents,
      stats: {
        maxTokens,
        contextTokens: this._estimateTokens(contextPrompt) + contents.reduce((total, item) => total + this._estimateTokens(item.parts[0].text), 0),
        historyEvents: history.length,
        omittedEvents: Math.max(0, source.length - history.length),
        hasSummary: Boolean(summary),
        currentMessageTokens: this._estimateTokens(currentInput)
      }
    };
  }

  buildImageContext({ activeSkill = 'general', codingLanguage = null } = {}) {
    const prompt = this.getSkillPrompt(activeSkill, codingLanguage);
    return { systemInstruction: prompt ? { parts: [{ text: prompt }] } : undefined, stats: { promptLength: prompt.length } };
  }

  _getHistory(snapshot) {
    const candidates = Array.isArray(snapshot)
      ? snapshot
      : (snapshot?.conversation || snapshot?.recent || snapshot?.recentMessages || []);
    if (!Array.isArray(candidates)) return [];
    return candidates
      .filter((event) => event && event.role !== 'system' && typeof event.content === 'string')
      .map((event) => ({ role: event.role === 'model' ? 'model' : 'user', content: event.content.trim() }))
      .filter((event) => event.content.length > 0);
  }

  _getSummary(snapshot) {
    const summary = snapshot?.summary;
    if (!summary || typeof summary !== 'object') return '';
    const activities = Object.entries(summary.activities || {}).map(([category, count]) => `${category}:${count}`).join(', ');
    return [
      activities ? `Session activities: ${activities}.` : '',
      summary.focus?.length ? `Focus: ${summary.focus.map((item) => item.skill).join(', ')}.` : ''
    ].filter(Boolean).join(' ');
  }

  _fitHistory(events, currentInput, maxTokens, prompt, summary, dedupeText = currentInput) {
    const budget = Math.max(32, maxTokens - this._estimateTokens(currentInput) - this._estimateTokens(prompt) - this._estimateTokens(summary));
    const selected = [];
    let used = 0;
    const candidates = events.filter((event) => event.content !== dedupeText && event.content !== currentInput);

    for (let index = candidates.length - 1; index >= 0;) {
      const event = candidates[index];
      const isCompleteTurn = event.role === 'model' && index > 0 && candidates[index - 1].role === 'user';
      const group = isCompleteTurn ? [candidates[index - 1], event] : [event];
      const cost = group.reduce((total, item) => total + this._estimateTokens(item.content), 0);

      if (used > 0 && used + cost > budget) break;
      if (used === 0 && cost > budget) {
        if (group.length === 2) {
          const firstBudget = Math.max(1, Math.floor(budget / 2));
          const secondBudget = Math.max(1, budget - firstBudget);
          selected.unshift(
            { ...group[0], content: this._truncateToTokens(group[0].content, firstBudget) },
            { ...group[1], content: this._truncateToTokens(group[1].content, secondBudget) }
          );
        } else {
          const latest = group[group.length - 1];
          selected.unshift({ ...latest, content: this._truncateToTokens(latest.content, budget) });
        }
        break;
      }

      selected.unshift(...group);
      used += cost;
      index -= group.length;
    }
    return selected;
  }

  _truncateToTokens(text, maxTokens) {
    const maxChars = Math.max(1, Math.floor(maxTokens * 4));
    const value = String(text || '');
    return value.length > maxChars ? `${value.slice(0, maxChars - 1)}.` : value;
  }

  _formatUserMessage(text, activeSkill) {
    return `[${String(activeSkill || 'general').toUpperCase()}] ${text}`;
  }

  _estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
  }
}

module.exports = new ContextBuilder();
