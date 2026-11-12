// Answers to what the user says into the microphone: the recognised text is matched against topics by word stems,
// the topic with the most hits picks the meme phrase. Pure logic, no DOM.

/** Letters and digits of any script are word characters here: `\b` in a stem is the edge of such a word
 *  (the regexp `\b` only knows Latin letters and would never match inside Russian text). */
const WORD_EDGE = '(?:(?<![\\p{L}\\d])(?=[\\p{L}\\d])|(?<=[\\p{L}\\d])(?![\\p{L}\\d]))';
const stems = (...sources) => sources.map((source) => new RegExp(source.replaceAll('\\b', WORD_EDGE), 'u'));

/** Topic → stems that point to it (over normalised text) and the phrases that answer it (keys from
 *  src/phrase-clips.mjs). Listed by priority: on a tie the earlier topic wins. */
export const REPLY_TOPICS = [
  { topic: 'quiet', phrases: ['molchat', 'ne_govori', 'no'],
    stems: stems('замолч', 'заткн', 'молчи', '\\bтихо', 'хватит', '\\bстоп\\b', 'отстан', 'уймись') },
  { topic: 'insult', phrases: ['dolboeb', 'eblan', 'korova', 'pyos', 'zaebal', 'psihopat', 'ne_govori'],
    stems: stems('\\bдура', 'идиот', '\\bурод', '\\bлох', '\\bтуп(ой|ая|ица|ые)', 'дебил', 'еблан', 'долбо', 'придур', 'кретин',
      '\\bжирн', '\\bтолст', '\\bпес\\b', '\\bкозел', '\\bчмо') },
  { topic: 'swear', phrases: ['ne_govori', 'pizdec', 'blyat_nahuy', 'o_blyat', 'zhestko'],
    stems: stems('\\bбля', 'нахуй', '\\bху(й|я|е)', 'пизд', '\\b(за|вы|по|у|на|до|от|въ)?еб(а|у|л)', '\\bсук(а|и)\\b') },
  { topic: 'greeting', phrases: ['privet', 'rebyata', 'na_svyazi', 'zhirny', 'ty_tut', 'pavlov', 'habibi'],
    stems: stems('привет', 'здравств', '\\bздоров', '\\bхай\\b', 'салам', 'добр(ое|ый|ой) (утро|день|вечер)', '\\bйоу?\\b', 'хелло') },
  { topic: 'howAreYou', phrases: ['normalno', 'kak_chlen', 'zhivoy', 'vse_budet', 'pohuy'],
    stems: stems('как (у тебя )?дела', '\\bкак ты\\b', '\\bкак сам', 'как жизнь', 'как поживаешь', 'нормально', 'что нового') },
  { topic: 'whoAreYou', phrases: ['tiktoker', 'kto_luchshiy', 'rebyata', 'dolboeb', 'shut_master'],
    stems: stems('\\bкто ты', '\\bты кто', 'как тебя зовут', 'мелл?стро', 'чекушк', 'блогер', 'стример') },
  { topic: 'money', phrases: ['babki', 'babok', 'millionov', 'maks_summa', 'stavki', 'levov', 'vozna', 'den_shestoy'],
    stems: stems('деньг', '\\bденег', '\\bбабк', '\\bбабл', '\\bбабос', 'зарплат', 'казино', '\\bставк', 'выигр', 'проигр', 'доллар',
      '\\bрубл', 'миллион', '\\bбогат', '\\bбедн', 'кредит', '\\bдолг(и|ов|а)?\\b') },
  { topic: 'praise', phrases: ['krasavchik', 'kto_luchshiy', 'imenno', 'normaldy', 'detka'],
    stems: stems('молодец', 'красав', '\\bкруто', '\\bкласс', '\\bлучш', '\\bкайф', '\\bсупер', 'охуе', 'отлично', '\\bумни', '\\bклев') },
  { topic: 'love', phrases: ['angel', 'detka', 'druzhit', 'ne_volnuysya', 'gey'],
    stems: stems('\\bлюбл', '\\bлюбов', 'нравишься', '\\bмил(ый|ая|ашка)', '\\bобним', '\\bцелу', 'скучаю') },
  { topic: 'women', phrases: ['baba', 'baba_dyrka', 'nastya', 'baba_suka', 'sinyaki', 'baba_bystree'],
    stems: stems('\\bбаб(а|ы|у|е|ой)\\b', 'девушк', 'девчонк', '\\bжен(а|у|ой|е)\\b', 'женщин', '\\bтел(ка|ки|ку|очк)', '\\bнаст(я|е|ю|и)\\b') },
  { topic: 'sad', phrases: ['ne_volnuysya', 'vse_budet', 'angel', 'zhizn', 'monitor'],
    stems: stems('грустн', '\\bплохо', '\\bустал', 'депрес', 'тяжело', 'проблем', '\\bболит', '\\bболею', 'страшно', '\\bбоюсь', 'одинок', '\\bплачу') },
  { topic: 'work', phrases: ['zavtra', 'poebat', 'chto_delat', 'kommentirovat', 'monitor', 'specnaz', 'degradaciya'],
    stems: stems('\\bработ', '\\bкод', 'програм', '\\bзадач', 'начальник', 'дедлайн', 'проект', '\\bсдела(й|ть)', '\\bучеб', 'домашк', 'экзамен') },
  { topic: 'food', phrases: ['olivie', 'ne_zhri', 'tolstaya_morda', 'detka', 'fu'],
    stems: stems('есть хочу', '\\bжрать', '\\bжрешь', '\\bед(а|у|ы)\\b', '\\bголод', '\\bпицц', 'бургер', 'оливье', '\\bкушать', '\\bпоесть',
      '\\bужин', '\\bобед', '\\bзавтрак') },
  { topic: 'drink', phrases: ['vody_kofe', 'krasny', 'baba', 'shcheki'],
    stems: stems('\\bпить', '\\bвыпить', '\\bвыпьем', '\\bводк', '\\bпив(о|а|ка)\\b', '\\bбуха', '\\bкофе', '\\bвод(а|ы|у)\\b', '\\bвин(о|а)\\b') },
  { topic: 'sleep', phrases: ['bayu', 'ty_tut', 'angel'],
    stems: stems('\\bспать', '\\bсон\\b', '\\bспишь', '\\bсплю', '\\bночь', '\\bночи\\b', '\\bзасып', 'спокойной') },
  { topic: 'weather', phrases: ['zhara', 'krasny'],
    stems: stems('\\bжарко', '\\bжар(а|у|ы)\\b', '\\bхолодно', '\\bпогод', '\\bлет(о|ом)\\b', '\\bзим(а|у|ой)\\b', '\\bдожд') },
  { topic: 'police', phrases: ['policiya', 'miliciya'],
    stems: stems('полиц', '\\bмент', 'милиц', '\\bсуд(а|у|ом)?\\b', 'тюрьм', '\\bпосад', '\\bзакон', '\\bарест') },
  { topic: 'dance', phrases: ['tancuem', 'pantera', 'habibi', 'tsupa'],
    stems: stems('\\bтанц', 'музык', '\\bпесн', '\\bспой', '\\bпляш') },
  { topic: 'friend', phrases: ['druzhit', 'tiktoker', 'dron'],
    stems: stems('\\bдружи', '\\bдруг(а|у|ом|ан)?\\b', '\\bбрат', '\\bбро\\b', '\\bкореш') },
  { topic: 'family', phrases: ['klyuch', 'mama_ptica', 'olivie'],
    stems: stems('\\bпап(а|е|у)\\b', '\\bбат(я|е|и)\\b', '\\bотец', '\\bмам(а|е|у)\\b', '\\bподар', 'день рожден') },
  { topic: 'toilet', phrases: ['govno_vonyaet', 'tualet', 'lyahov', 'nasri'],
    stems: stems('\\bговн', '\\bкакать', 'туалет', '\\bпукн', 'обосра', '\\bвоня') },
  { topic: 'surprise', phrases: ['nihuya', 'ne_byvaet', 'zhestko', 'o_blyat', 'eto_on'],
    stems: stems('\\bвау\\b', '\\bого\\b', 'ничего себе', 'не может быть', '\\bправда', 'серьезно', '\\bреально', 'офиге') },
  { topic: 'hurry', phrases: ['bystree', 'baba_bystree', 'tolstyy', 'dai_dai'],
    stems: stems('\\bбыстр', '\\bскорее', '\\bдавай', '\\bпоехали', '\\bпогнали') },
  { topic: 'later', phrases: ['zavtra', 'poebat', 'pohuy'],
    stems: stems('\\bпотом\\b', '\\bзавтра', '\\bпозже', 'когда-нибудь', '\\bлень') },
  { topic: 'question', phrases: ['chto_delat', 'pochemu', 'kommentirovat', 'palaich', 'podozritelno'],
    stems: stems('\\bпочему', '\\bзачем', '\\bчто (это|делать|такое)', '\\bкак\\b', '\\bгде\\b', '\\bкогда\\b', '\\bсколько\\b') },
  { topic: 'yes', phrases: ['imenno', 'normaldy'],
    stems: stems('^да\\b', '\\bага\\b', '\\bточно\\b', '\\bименно\\b', '\\bконечно\\b', '\\bсогласен') },
  { topic: 'no', phrases: ['no', 'pohuy', 'pochemu'],
    stems: stems('^нет\\b', '\\bне хочу', '\\bне буду', '\\bникогда') },
];

/** What he says when nothing in the words gives a clue. */
export const FALLBACK_PHRASES = ['kommentirovat', 'podozritelno', 'sverchki', 'pochemu', 'pohuy', 'shcheki', 'dolboeb'];

/** Lower case, ё → е, punctuation and repeated spaces gone. */
export const normalize = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[^\p{L}\d\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The topic of `text` as `{ topic, phrases }`, the fallback when no stem matches, or null for an empty text. */
export function replyTopic(text) {
  const words = normalize(text);
  if (!words) return null;
  let best = null, bestHits = 0;
  for (const entry of REPLY_TOPICS) {
    const hits = entry.stems.filter((stem) => stem.test(words)).length;
    if (hits > bestHits) { best = entry; bestHits = hits; }
  }
  return best ? { topic: best.topic, phrases: best.phrases } : { topic: 'unknown', phrases: FALLBACK_PHRASES };
}
