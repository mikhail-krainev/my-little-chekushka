// Answers to what the user says into the microphone. Each rule pairs triggers (word stems and whole phrases) with the
// meme phrases that answer them best; the rule whose triggers match the most words wins, so «как у тебя дела» beats a
// lone «как». Within a rule the answers take turns, and the last answer is never repeated back to back. Pure logic.

/** Letters and digits of any script are word characters here: `\b` in a trigger is the edge of such a word
 *  (the regexp `\b` only knows Latin letters and would never match inside Russian text). */
const WORD_EDGE = '(?:(?<![\\p{L}\\d])(?=[\\p{L}\\d])|(?<=[\\p{L}\\d])(?![\\p{L}\\d]))';
/** A trigger scores one point per word it spans (a group of alternatives counts as one word): a matched phrase
 *  outweighs a matched single word. */
const trigger = (source) => ({
  regexp: new RegExp(source.replaceAll('\\b', WORD_EDGE), 'u'),
  weight: source.replace(/\([^)]*\)\??/g, 'x').trim().split(/\s+/).length,
});
const rule = (topic, phrases, ...sources) => ({ topic, phrases, triggers: sources.map(trigger) });

/** Ordered by priority: on equal scores the earlier rule wins. Keys come from src/phrase-clips.mjs. */
export const REPLY_RULES = [
  // talking to him
  rule('areYouThere', ['ty_tut'], '\\bты тут', '\\bты здесь', '\\bты где', '\\bспишь\\b', '\\bне спишь', '\\bалло\\b', '\\bау\\b', '\\bэй\\b'),
  rule('greeting', ['privet', 'rebyata', 'na_svyazi', 'habibi'],
    '\\bпривет', '\\bздравств', '\\bздоров(о|а)\\b', '\\bхай\\b', '\\bсалам', '\\bдобр(ое|ый|ой) (утро|день|вечер)', '\\bхелло', '\\bприветик'),
  rule('meet', ['pavlov'], '\\bменя зовут', '\\bпознаком', '\\bрад знакомств', '\\bприятно познаком', '\\bя андрей', '\\bвзаимно'),
  rule('howAreYou', ['kak_chlen', 'normalno', 'zhivoy'],
    '\\bкак (у тебя )?дела', '\\bкак ты\\b', '\\bкак сам', '\\bкак жизнь', '\\bкак поживаешь', '\\bкак себя чувствуешь', '\\bты как\\b', '\\bчто нового'),
  rule('fine', ['normaldy', 'vse_budet', 'pohuy'], '\\bнормально\\b', '\\bхорошо\\b', '\\bотлично\\b', '\\bпойдет\\b', '\\bнорм\\b'),
  rule('whoAreYou', ['tiktoker', 'rebyata', 'shut_master'],
    '\\bкто ты', '\\bты кто', '\\bкак тебя зовут', '\\bмелл?строй', '\\bчекушк', '\\bблогер', '\\bстример', '\\bтикток'),
  rule('whoIsBest', ['kto_luchshiy', 'krasavchik'], '\\bкто лучш', '\\bты лучш', '\\bсамый лучш', '\\bкрасавчик', '\\bлегенд', '\\bкрасав'),
  rule('praise', ['krasavchik', 'imenno', 'normaldy'], '\\bмолодец', '\\bкруто', '\\bкласс', '\\bкайф', '\\bсупер', '\\bохуенн', '\\bзаебись', '\\bогонь', '\\bспасибо'),
  rule('laugh', ['normaldy', 'tancuem'], '\\bха ха', '\\bхаха', '\\bсмешно', '\\bржу', '\\bлол\\b', '\\bугар'),
  rule('bye', ['bayu', 'pohuy', 'zavtra'], '\\bпока\\b', '\\bдо свидания', '\\bспокойной ночи', '\\bя спать', '\\bпошел спать', '\\bдо завтра', '\\bувидимся'),

  // rudeness
  rule('callsHimStupid', ['dolboeb', 'eblan', 'degradaciya'],
    '\\bты (дурак|тупой|идиот|дебил|долбоеб|придурок|кретин|еблан|лох|даун)', '\\bдолбоеб', '\\bдебил', '\\bидиот', '\\bтупой', '\\bдурак', '\\bпридур', '\\bеблан', '\\bдаун\\b', '\\bлох\\b'),
  rule('callsHimFat', ['zhirny', 'tolstyy', 'tolstaya_morda'], '\\bжирн', '\\bтолст', '\\bпузо', '\\bпузат', '\\bсвинья', '\\bборов'),
  rule('callsHimGay', ['gey'], '\\bгей', '\\bпидор', '\\bгомик'),
  rule('sendsHimAway', ['pyos', 'korova', 'zaebal', 'psihopat'],
    '\\bпошел (ты )?(на|в)', '\\bиди (ты )?(на|в)', '\\bотвали', '\\bотъебись', '\\bуйди', '\\bурод', '\\bсволоч', '\\bскотин', '\\bтварь', '\\bненавижу'),
  rule('shutUp', ['molchat', 'no', 'ne_govori'], '\\bзаткни', '\\bзамолчи', '\\bмолчи', '\\bзавали', '\\bтихо\\b', '\\bхватит', '\\bстоп\\b', '\\bне ори'),
  rule('swearing', ['ne_govori', 'o_blyat', 'blyat_nahuy'], '\\bбля', '\\bнахуй', '\\bхуй', '\\bхуе', '\\bпизд', '\\b(за|вы|по|у|на|до|от|въ)?еб(а|у|л)', '\\bсук(а|и)\\b'),
  rule('sour', ['kislyy', 'krasny'], '\\bкислый', '\\bгрустный ты', '\\bчто кислый', '\\bчто такой красный', '\\bпокраснел', '\\bкрасный'),
  rule('angry', ['psihopat', 'zaebal', 'aaa'], '\\bпсих', '\\bзлой', '\\bбесишь', '\\bдостал', '\\bзаебал', '\\bнадоел', '\\bагресс'),

  // feelings
  rule('scared', ['angel', 'ne_volnuysya'], '\\bстрашно', '\\bбоюсь', '\\bтемно', '\\bночью', '\\bкошмар'),
  rule('sad', ['ne_volnuysya', 'vse_budet', 'angel'],
    '\\bгрустн', '\\bпечальн', '\\bплохо\\b', '\\bхреново', '\\bустал', '\\bдепресс', '\\bтяжело', '\\bпроблем', '\\bболит', '\\bболею', '\\bплачу', '\\bодинок', '\\bне получается'),
  rule('lifeIsHard', ['zhizn', 'den_shestoy', 'monitor'], '\\bжизнь (дерьмо|говно|отстой|боль)', '\\bвсе плохо', '\\bнеудач', '\\bне везет', '\\bпроигрыва'),
  rule('love', ['angel', 'detka', 'druzhit'], '\\bлюблю тебя', '\\bлюблю\\b', '\\bлюбов', '\\bнравишься', '\\bмилый', '\\bмилаш', '\\bобним', '\\bпоцелу', '\\bскучаю'),
  rule('friends', ['druzhit', 'tiktoker', 'dron'], '\\bдавай дружить', '\\bдружи', '\\bбудешь (моим )?другом', '\\bдруг\\b', '\\bбратан', '\\bбратик', '\\bбро\\b', '\\bкореш'),
  rule('surprise', ['nihuya', 'ne_byvaet', 'zhestko', 'eto_on'],
    '\\bничего себе', '\\bне может быть', '\\bда ладно', '\\bвау\\b', '\\bого\\b', '\\bофиге', '\\bжесть', '\\bжестко', '\\bкапец', '\\bохренеть'),
  rule('really', ['ne_byvaet', 'imenno'], '\\bправда\\b', '\\bсерьезно', '\\bреально\\b', '\\bчестно\\b', '\\bне врешь', '\\bты (врешь|пиздишь)'),
  rule('yes', ['imenno'], '^да\\b', '\\bага\\b', '\\bточно\\b', '\\bименно\\b', '\\bконечно\\b', '\\bсогласен'),
  rule('no', ['no', 'pochemu'], '^нет\\b', '\\bне хочу', '\\bне буду', '\\bникогда'),

  // his life: money, gambling, the law
  rule('broke', ['babok', 'den_shestoy'], '\\bнет денег', '\\bбез денег', '\\bбедн', '\\bнищ', '\\bкредит', '\\bдолг(и|ов|а)?\\b', '\\bпроиграл', '\\bпросрал'),
  rule('won', ['millionov', 'maks_summa', 'krasavchik'], '\\bвыиграл', '\\bвыигрыш', '\\bзанос', '\\bджекпот', '\\bповезло'),
  rule('betting', ['stavki', 'levov'], '\\bставк', '\\bставить', '\\bставлю', '\\bпоставь', '\\bказино', '\\bфутбол', '\\bматч', '\\bбукмекер', '\\bслоты', '\\bрулетк'),
  rule('money', ['babki', 'millionov', 'maks_summa', 'vozna'],
    '\\bденьг', '\\bденег', '\\bбабк', '\\bбабл', '\\bбабос', '\\bзарплат', '\\bдоллар', '\\bрубл', '\\bмиллион', '\\bбогат', '\\bзаработ'),
  rule('police', ['policiya', 'miliciya'], '\\bполиц', '\\bмент', '\\bмилиц', '\\bсуд(а|у|ом)?\\b', '\\bтюрьм', '\\bпосад', '\\bарест', '\\bзакон', '\\bвызову'),
  rule('lady', ['baba', 'sinyaki', 'baba_dyrka', 'baba_suka'], '\\bбаб(а|ы|у|е|ой)\\b', '\\bдевушк', '\\bдевчонк', '\\bжен(а|у|ой|е)\\b', '\\bженщин', '\\bтел(ка|ки|ку|очк)'),
  rule('compliment', ['nastya', 'detka'], '\\bкомплимент', '\\bкрасив', '\\bнаст(я|е|ю|и)\\b', '\\bсексуальн'),
  rule('comeHere', ['tsupa', 'dai_ego'], '\\bиди сюда', '\\bиди ко мне', '\\bкис кис', '\\bмалыш'),
  rule('give', ['dai_dai', 'dai_ego'], '\\bдай\\b', '\\bдай мне', '\\bотдай', '\\bподелись'),
  rule('hurry', ['bystree', 'baba_bystree', 'specnaz'], '\\bбыстр', '\\bскорее', '\\bпоехали', '\\bпогнали', '\\bработай', '\\bшевелись'),
  rule('later', ['zavtra', 'poebat'], '\\bпотом\\b', '\\bзавтра', '\\bпозже', '\\bлень', '\\bне сейчас'),
  rule('doIt', ['poebat', 'zavtra', 'chto_delat'], '\\bсделай', '\\bсделаешь', '\\bсделать', '\\bнадо (сделать|работать)', '\\bзадани', '\\bдомашк'),
  rule('work', ['monitor', 'kommentirovat', 'specnaz', 'degradaciya'], '\\bработ', '\\bкод', '\\bпрограмм', '\\bначальник', '\\bдедлайн', '\\bпроект', '\\bофис', '\\bкомпьютер'),
  rule('like', ['klik'], '\\bлайк', '\\bподпиш', '\\bклик', '\\bколен', '\\bрепост'),
  rule('stupidity', ['degradaciya', 'dolboeb'], '\\bдеград', '\\bтупе', '\\bмозг'),

  // food, drink and the body
  rule('food', ['ne_zhri', 'tolstaya_morda', 'olivie'],
    '\\bесть хочу', '\\bжрать', '\\bжрешь', '\\bед(а|у|ы)\\b', '\\bголод', '\\bпицц', '\\bбургер', '\\bкушать', '\\bпоесть', '\\bужин', '\\bобед', '\\bзавтрак'),
  rule('salad', ['olivie'], '\\bоливье', '\\bсалат', '\\bновый год', '\\bпраздник'),
  rule('drink', ['vody_kofe', 'krasny', 'shcheki'], '\\bпить\\b', '\\bвыпить', '\\bвыпьем', '\\bводк', '\\bпив(о|а|ка)\\b', '\\bбуха', '\\bпьян', '\\bкофе', '\\bвод(а|ы|у)\\b', '\\bвин(о|а)\\b'),
  rule('hot', ['zhara', 'krasny'], '\\bжарко', '\\bжар(а|у|ы)\\b', '\\bдушно', '\\bлето\\b', '\\bсолнце'),
  rule('toilet', ['govno_vonyaet', 'lyahov', 'nasri', 'tualet'], '\\bговн', '\\bкакать', '\\bпукн', '\\bобосра', '\\bвоня', '\\bпахнет'),
  rule('death', ['tualet', 'zhizn'], '\\bумр', '\\bсдохн', '\\bсмерт', '\\bтуалет'),
  rule('cleanTeeth', ['poroshki'], '\\bпорош', '\\bзубн', '\\bпаст(а|у)\\b', '\\bмыло'),
  rule('mom', ['mama_ptica'], '\\bмам(а|е|у|ой)\\b', '\\bмамк', '\\bчто ты несешь', '\\bчто за бред'),
  rule('gift', ['klyuch'], '\\bподар', '\\bпап(а|е|у)\\b', '\\bбат(я|е|и)\\b', '\\bотец', '\\bдень рожден', '\\bключ'),
  rule('skydive', ['parashyut'], '\\bпарашют', '\\bпрыгн', '\\bпрыжок', '\\bэкстрим', '\\bсамолет'),
  rule('dance', ['tancuem', 'pantera', 'habibi'], '\\bтанц', '\\bмузык', '\\bпесн', '\\bспой', '\\bпляш', '\\bдискотек'),
  rule('arabs', ['habibi'], '\\bхабиби', '\\bдубай', '\\bараб', '\\bшейх'),
  rule('drone', ['dron'], '\\bдрон', '\\bтемный'),
  rule('youtuber', ['bandera'], '\\bбандер', '\\bмайнкрафт', '\\bютуб'),
  rule('whoIsIt', ['palaich', 'eto_on'], '\\bкто такой', '\\bкто это', '\\bпалыч', '\\bсергеевич', '\\bэто он'),
  rule('master', ['shut_master'], '\\bшут', '\\bмастер'),
  rule('sleep', ['bayu', 'ty_tut'], '\\bспать', '\\bсон\\b', '\\bзасып', '\\bусыпи', '\\bколыбельн', '\\bбаю'),
  rule('disgust', ['fu', 'kommentirovat'], '\\bфу\\b', '\\bчто это (за|такое)', '\\bмерзко', '\\bгадость', '\\bотвратит'),
  rule('whatToDo', ['chto_delat', 'kommentirovat', 'poebat'], '\\bчто делать', '\\bчто мне делать', '\\bпомоги', '\\bпосоветуй', '\\bподскажи', '\\bкак быть'),
  rule('why', ['pochemu', 'kommentirovat'], '\\bпочему', '\\bзачем', '\\bс какой стати'),
];

/** No rule matched: a question gets a puzzled answer, anything else a shrug. */
export const FALLBACK = {
  question: { topic: 'question', phrases: ['kommentirovat', 'chto_delat', 'pochemu', 'palaich', 'podozritelno'] },
  statement: { topic: 'unknown', phrases: ['podozritelno', 'sverchki', 'pohuy', 'shcheki', 'mama_ptica', 'kommentirovat'] },
};
const QUESTION_WORDS = /^(что|чего|как|какой|какая|какие|почему|зачем|кто|где|когда|куда|откуда|сколько|а ты|ты)(?= |$)/u;

/** Speech this short or only filler is noise, not something said to him. */
const FILLER = new Set(['а', 'и', 'э', 'эм', 'ну', 'о', 'у', 'м', 'мм', 'ой', 'ах', 'эх', 'хм', 'вот', 'так', 'да', 'нет', 'это']);
/** Below this mean word confidence the recogniser was guessing (background talk, TV, music). */
export const MIN_CONFIDENCE = 0.6;

/** Lower case, ё → е, punctuation and repeated spaces gone. */
export const normalize = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[^\p{L}\d\s-]/gu, ' ').replace(/\s+/g, ' ').trim();

/** True when `text` heard with mean word `confidence` (0...1, or undefined when unknown) deserves an answer. */
export function isWorthAnswering(text, confidence) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  if (Number.isFinite(confidence) && confidence < MIN_CONFIDENCE) return false;
  if (words.every((w) => FILLER.has(w))) return words.length === 1 && (words[0] === 'да' || words[0] === 'нет');
  return true;
}

/** The best rule for `text` as `{ topic, phrases }`, a fallback when nothing matches, or null for an empty text. */
export function replyTopic(text) {
  const words = normalize(text);
  if (!words) return null;
  let best = null, bestScore = 0;
  for (const entry of REPLY_RULES) {
    const score = entry.triggers.reduce((sum, t) => sum + (t.regexp.test(words) ? t.weight : 0), 0);
    if (score > bestScore) { best = entry; bestScore = score; }
  }
  if (best) return { topic: best.topic, phrases: best.phrases };
  return QUESTION_WORDS.test(words) ? FALLBACK.question : FALLBACK.statement;
}

/** Hands out a rule's answers in turn, skipping the phrase that was said last, whatever rule it came from. */
export class ReplyPicker {
  constructor() {
    this.turn = new Map();          // topic → index of its next answer
    this.last = null;
  }

  /** The next phrase key for `reply` ({ topic, phrases }) among those `isAvailable` accepts, or null. */
  next(reply, isAvailable = () => true) {
    const options = reply.phrases.filter(isAvailable);
    if (options.length === 0) return null;
    const start = this.turn.get(reply.topic) ?? 0;
    let key = options[start % options.length];
    if (key === this.last && options.length > 1) key = options[(start + 1) % options.length];
    this.turn.set(reply.topic, options.indexOf(key) + 1);
    this.last = key;
    return key;
  }
}
