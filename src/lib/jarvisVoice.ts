// Browser voices vary by operating system. Prefer known feminine English voices.
export function configureJarvisVoice(utterance: SpeechSynthesisUtterance) {
  const english = window.speechSynthesis.getVoices().filter(voice => /^en(?:-|_)/i.test(voice.lang));
  const feminine = /\b(?:heera|neerja|zira|aria|jenny|sonia|samantha|victoria|karen|moira|tessa|susan|hazel|female)\b/i;
  const voice = english.find(voice => feminine.test(voice.name) && /^en-in$/i.test(voice.lang))
    ?? english.find(voice => feminine.test(voice.name))
    ?? english.find(voice => /^en-in$/i.test(voice.lang))
    ?? english.find(voice => voice.default) ?? english[0];
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-IN";
  utterance.pitch = 1.18;
  utterance.rate = 2;
  utterance.volume = 1;
}
