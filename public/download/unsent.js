/* The Unsent: data and helpers for the "Why this exists" experience.
 *
 * A visitor picks someone they have been meaning to say something to, picks (or
 * says) the sentence, sees it as the preview Echo shows before anything is sent,
 * and is then handed the keyboard race below with that same sentence.
 *
 * Plain functions, no DOM, so public/download/unsent.test.ts can pin the parts
 * that are easy to get quietly wrong:
 *  - every Hindi sentence has to be typeable on the race's Devanagari grid, or the
 *    race would strand the visitor on a key that does not exist;
 *  - every English sentence has to reduce to the race's lowercase letters.
 *
 * HI: native review needed. The Hindi is a draft written to be gender-neutral for
 * the speaker, and nothing here claims a person said it: it is a preview.
 */

/** Only English and Hindi are fully supported; every other page language shows English. */
export function uiLang(code) {
  return code === 'hi' ? 'hi' : 'en';
}

export const PEOPLE = [
  { id: 'ma',     en: 'Ma',                       hi: 'माँ' },
  { id: 'papa',   en: 'Papa',                     hi: 'पापा' },
  { id: 'friend', en: 'A friend',                 hi: 'एक दोस्त' },
  { id: 'sorry',  en: 'Someone I owe a sorry',    hi: 'जिससे माफ़ी माँगनी है' },
  { id: 'thanks', en: 'Someone who helped me',    hi: 'जिसने मेरी मदद की' },
];

/** Three ready sentences per person, each with the same meaning in both languages. */
export const MESSAGES = {
  ma: [
    { en: 'Ma, I missed you today.',        hi: 'मां, आज आपकी याद आई।' },
    { en: 'Ma, I am fine. Do not worry.',   hi: 'मां, मैं ठीक हूं। चिंता मत करना।' },
    { en: 'Ma, you were right.',            hi: 'मां, आप सही थीं।' },
  ],
  papa: [
    { en: 'Papa, you were right.',          hi: 'पापा, आप सही थे।' },
    { en: 'Papa, I am proud of you.',       hi: 'पापा, मुझे आप पर गर्व है।' },
    { en: 'Papa, let us meet soon.',        hi: 'पापा, जल्दी मिलते हैं।' },
  ],
  friend: [
    { en: 'Yaar, I miss you.',              hi: 'यार, तेरी याद आती है।' },
    { en: 'Let us meet this week.',         hi: 'इस हफ्ते मिलते हैं।' },
    { en: 'Thanks for always being there.', hi: 'हमेशा साथ रहने का शुक्रिया।' },
  ],
  sorry: [
    { en: 'I made a mistake. I am sorry.',  hi: 'मुझसे गलती हो गई। माफ करना।' },
    { en: 'I am sorry you felt hurt.',      hi: 'तुम्हें बुरा लगा, मुझे अफसोस है।' },
    { en: 'Can we talk again?',             hi: 'क्या हम फिर से बात कर सकते हैं?' },
  ],
  thanks: [
    { en: 'This would not have happened without you.', hi: 'आपके बिना यह नहीं हो पाता।' },
    { en: 'I will always remember this.',   hi: 'यह मुझे हमेशा याद रहेगा।' },
    { en: 'Thank you for being there.',     hi: 'साथ देने के लिए शुक्रिया।' },
  ],
};

export function messagesFor(personId) {
  return MESSAGES[personId] || [];
}

export function personLabel(personId, lang) {
  const p = PEOPLE.find(x => x.id === personId);
  return p ? p[uiLang(lang)] : '';
}

/**
 * What the keyboard race has to type for a sentence. The race has lowercase Latin
 * letters and a Devanagari grid: no capitals, no punctuation, no apostrophes.
 */
export function raceTarget(text, lang) {
  const s = String(text || '');
  if (lang === 'hi') {
    return s.replace(/[।,.?!]/g, '').replace(/\s+/g, ' ').trim();
  }
  return s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/** "3.2s", for a duration in milliseconds. */
export function formatSeconds(ms) {
  return (Math.max(0, ms) / 1000).toFixed(1) + 's';
}

export const STRINGS = {
  en: {
    eyebrow: 'Why this exists',
    whoH: 'Is there something you have been meaning to say?',
    whoSub: 'Pick who it is for. Nothing here is saved or sent.',
    whatH: (who) => 'What would you say to ' + who + '?',
    orSay: 'Or hold the button and say your own',
    hold: 'Hold to speak',
    listening: 'Listening…',
    heard: 'You said:',
    noMic: 'Your browser cannot listen here, so tap one above.',
    denied: 'The microphone was not allowed. Tap one above instead.',
    nothing: 'Nothing was heard. Hold the button a little longer.',
    back: 'Pick someone else',
    toLabel: (who) => 'To ' + who,
    previewH: 'Here it is, before it goes anywhere.',
    previewNote: 'This is a preview. Nothing was sent. Echo shows you this first, every time.',
    yes: 'That is what I meant',
    again: 'Say it another way',
    tookSpoken: (t) => 'You said that in ' + t + '.',
    tookTapped: 'That took one tap.',
    typeIntro: 'Now try typing the same sentence, the way you would have to.',
    typeBtn: 'Type it',
    skip: 'Skip this',
  },
  hi: {
    eyebrow: 'Echo क्यों बना',
    whoH: 'कुछ ऐसा है जो आप किसी से कहना चाहते थे?',
    whoSub: 'किसके लिए है, चुनिए। यहाँ कुछ भी सेव या भेजा नहीं जाता।',
    whatH: (who) => who + ' से आप क्या कहेंगे?',
    orSay: 'या बटन दबाए रखकर अपनी बात बोलिए',
    hold: 'बोलने के लिए दबाए रखें',
    listening: 'सुन रहा हूँ…',
    heard: 'आपने कहा:',
    noMic: 'आपका ब्राउज़र यहाँ सुन नहीं सकता, इसलिए ऊपर से एक चुनिए।',
    denied: 'माइक्रोफ़ोन की अनुमति नहीं मिली। ऊपर से एक चुनिए।',
    nothing: 'कुछ सुनाई नहीं दिया। बटन थोड़ी देर और दबाए रखें।',
    back: 'किसी और को चुनिए',
    toLabel: (who) => who + ' को',
    previewH: 'भेजने से पहले, यह ऐसा दिखता है।',
    previewNote: 'यह सिर्फ़ प्रीव्यू है। कुछ भेजा नहीं गया। Echo हर बार पहले यही दिखाता है।',
    yes: 'यही कहना था',
    again: 'दूसरे तरीके से कहिए',
    tookSpoken: (t) => 'आपने यह ' + t + ' में कह दिया।',
    tookTapped: 'इसमें एक टैप लगा।',
    typeIntro: 'अब यही वाक्य टाइप करके देखिए, जैसे करना पड़ता।',
    typeBtn: 'टाइप करके देखें',
    skip: 'इसे छोड़ें',
  },
};
