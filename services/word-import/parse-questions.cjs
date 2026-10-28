const fs = require('node:fs');
const { parseWordQuestions } = require('../../question_word_import.js');

function parseSource(source) {
  const parsed = parseWordQuestions(source.text);
  return parsed.questions.map((q, index) => {
    const used = new Set();
    const restore = value => String(value || '').replace(/WORDBLOCK\d+TOKEN/g, key => {
      used.add(key);
      if (!source.blocks[key]) throw new Error(`Missing source block ${key}`);
      return source.blocks[key].text;
    });
    const text = q.options?.length
      ? [q.question_text, ...q.options.map((value,i) => `${String.fromCharCode((q.question_type === 'true_false' ? 97 : 65)+i)}. ${value}`)].join('\n')
      : q.question_text;
    const question_text = restore(text);
    const answer = restore(q.answer);
    const answer_text = restore(q.answer_text);
    const warnings = [...new Set([...(q._importWarnings || []), ...[...used].flatMap(key => source.blocks[key].warnings || [])])];
    return {
      ordinal: q._sourceOrdinal || index + 1, needs_attention: warnings.length > 0,
      warnings,
      payload: { question_text, question_type: q.question_type, answer, answer_text: answer_text || null,
        answer_count: q.answer_count, difficulty: q.difficulty || 5 },
    };
  });
}
if (require.main === module) {
  process.stdout.write(JSON.stringify(parseSource(JSON.parse(fs.readFileSync(0, 'utf8')))));
}
module.exports = { parseSource };
