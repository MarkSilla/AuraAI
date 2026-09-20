const KOKORO_VOCAB: Record<string, number> = {
  '$': 0, ';': 1, ':': 2, ',': 3, '.': 4, '!': 5, '?': 6, '—': 9, '…': 10,
  '"': 11, '(': 12, ')': 13, '“': 14, '”': 15, ' ': 16, '̃': 17,
  'A': 24, 'I': 25, 'O': 31, 'Q': 33, 'S': 35, 'T': 36, 'W': 39, 'Y': 41,
  'a': 43, 'b': 44, 'c': 45, 'd': 46, 'e': 47, 'f': 48, 'h': 50, 'i': 51,
  'j': 52, 'k': 53, 'l': 54, 'm': 55, 'n': 56, 'o': 57, 'p': 58, 'q': 59,
  'r': 60, 's': 61, 't': 62, 'u': 63, 'v': 64, 'w': 65, 'x': 66, 'y': 67, 'z': 68,
  'ɑ': 69, 'ɐ': 70, 'ɒ': 71, 'æ': 72, 'β': 75, 'ɔ': 76, 'ç': 78, 'ð': 81,
  'ə': 83, 'ɚ': 85, 'ɛ': 86, 'ɜ': 87, 'ɟ': 90, 'ɡ': 92, 'ɥ': 99,
  'ɨ': 101, 'ɪ': 102, 'ʝ': 103, 'ɯ': 110, 'ɰ': 111, 'ŋ': 112, 'ɳ': 113,
  'ɲ': 114, 'ɴ': 115, 'ø': 116, 'ɸ': 118, 'θ': 119, 'œ': 120, 'ɹ': 123,
  'ɾ': 125, 'ɻ': 126, 'ʁ': 128, 'ɽ': 129, 'ʂ': 130, 'ʃ': 131, 'ʈ': 132,
  'ʧ': 133, 'ʊ': 135, 'ʋ': 136, 'ʌ': 138, 'ɣ': 139, 'ɤ': 140, 'χ': 142,
  'ʎ': 143, 'ʒ': 147, 'ʔ': 148, 'ˈ': 156, 'ˌ': 157, 'ː': 158, 'ʰ': 162,
  'ʲ': 164, '↓': 169, '→': 171, '↗': 172, '↘': 173, 'ᵻ': 177,
};

const WORDS: Record<string, string> = {
  a: 'ə', an: 'ən', and: 'ænd', are: 'ɑɹ', be: 'biː', can: 'kæn',
  do: 'duː', for: 'fɔɹ', from: 'fɹəm', have: 'hæv', he: 'hiː',
  hello: 'həˈloʊ', how: 'haʊ', i: 'aɪ', is: 'ɪz', it: 'ɪt', me: 'miː',
  my: 'maɪ', of: 'əv', on: 'ɑn', or: 'ɔɹ', please: 'pliːz', the: 'ðə',
  this: 'ðɪs', that: 'ðæt', thank: 'θæŋk', thanks: 'θæŋks', to: 'tə',
  you: 'juː', your: 'jɔɹ', aura: 'ˈɔɹə', ai: 'ˌeɪˈaɪ', okay: 'oʊˈkeɪ',
};

const LETTERS: Record<string, string> = {
  a: 'æ', b: 'b', c: 'k', d: 'd', e: 'ɛ', f: 'f', g: 'ɡ', h: 'h',
  i: 'ɪ', j: 'dʒ', k: 'k', l: 'l', m: 'm', n: 'n', o: 'ɑ', p: 'p',
  q: 'k', r: 'ɹ', s: 's', t: 't', u: 'ʌ', v: 'v', w: 'w', x: 'ks',
  y: 'j', z: 'z',
};

function wordToIpa(word: string) {
  const lower = word.toLowerCase();
  if (WORDS[lower]) return WORDS[lower];
  let result = '';
  let index = 0;
  while (index < lower.length) {
    const pair = lower.slice(index, index + 2);
    const triple = lower.slice(index, index + 3);
    if (triple === 'tch') { result += 'ʧ'; index += 3; continue; }
    if (triple === 'igh') { result += 'aɪ'; index += 3; continue; }
    if (triple === 'tion') { result += 'ʃən'; index += 4; continue; }
    if (pair === 'ch' || pair === 'tch') { result += 'ʧ'; index += 2; continue; }
    if (pair === 'sh') { result += 'ʃ'; index += 2; continue; }
    if (pair === 'th') { result += lower[index - 1] && 'aeiou'.includes(lower[index - 1]) ? 'θ' : 'ð'; index += 2; continue; }
    if (pair === 'ph') { result += 'f'; index += 2; continue; }
    if (pair === 'ng') { result += 'ŋ'; index += 2; continue; }
    if (pair === 'ee' || pair === 'ea') { result += 'iː'; index += 2; continue; }
    if (pair === 'oo') { result += 'uː'; index += 2; continue; }
    if (pair === 'ou' || pair === 'ow') { result += 'aʊ'; index += 2; continue; }
    if (pair === 'ai' || pair === 'ay') { result += 'eɪ'; index += 2; continue; }
    if (pair === 'oa') { result += 'oʊ'; index += 2; continue; }
    result += LETTERS[lower[index]] || '';
    index += 1;
  }
  return result || 'ə';
}

export function phonemizeKokoroText(text: string) {
  const normalized = text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,!?;:()"'—…]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ipa = normalized.replace(/[A-Za-z]+/g, wordToIpa);
  const ids = [...ipa].map((character) => KOKORO_VOCAB[character]).filter((id): id is number => id !== undefined);
  if (ids.length === 0) throw new Error('Kokoro could not find pronounceable text in this response.');
  if (ids.length > 510) {
    throw new Error('This response is too long for one Kokoro utterance. Select a shorter response to speak.');
  }
  return ids;
}
