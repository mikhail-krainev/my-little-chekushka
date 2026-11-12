// Which meme phrase answers which thing the user does. Pure logic, no DOM: the app feeds it events and clock times.

/** Trigger → the phrases it may play (keys from src/phrase-clips.mjs); with several, one is picked at random and
 *  not the same twice in a row. A click plays a random phrase from all of them instead. */
export const TRIGGER_PHRASES = {
  // the system (files and apps)
  folderCreated: ['vozna'],             // «Пошла валютная возня»
  fileDownloaded: ['babki', 'millionov'],   // «Бабки рулятся…», «Пять миллионов долларов за три грёбаных часа!»
  screenshot: ['normaldy', 'krasavchik', 'imenno'],   // «…И ведь нормалды!», «Красавчик… охуенно», «Да, да, именно это!»
  fileCreated: ['nihuya', 'ne_byvaet'], // «Нихуя себе. И вправду потужненько», «Ну нахуй! Такого не бывает!»
  fileDeleted: ['babok'],               // «Бабок, сука, больше нет. Блядь»
  massDelete: ['miliciya', 'policiya'], // «Суд! Милиция! Помогите!», «Пизда мне. Меня нашла полиция…»
  browserLaunched: ['stavki', 'levov'], // «Только ставки: футбол, хуйбол…», «Надо пять левов на Баликина!»
  messengerLaunched: ['ty_tut'],        // «Привет, ты тут? Я тут. Привет, спишь?»
  codeLaunched: ['kommentirovat', 'chto_delat', 'zavtra'],   // «…как это комментировать», «Что нужно делать?», «Давай завтра…»
  appLaunched: ['bystree', 'baba_bystree'],   // «Быстрее!», «Баба, быстрее!»
  appQuit: ['pohuy'],                   // «Да похуй, ну и ладно»
  userBack: ['zhivoy', 'normalno', 'zhirny', 'tolstyy', 'kislyy'],   // «Живой», «Нормально всё?», «Здорово, жирный!»,
                                        // «Толстый-то тут?», «Чё кислый такой?»: after a long pause
  appStart: ['privet', 'rebyata', 'na_svyazi'],   // «Привет, дорогие зрители…», «Ребята, всем привет!», «На связи, птенцы»
  // what the user does to the mascot
  pickedUp: ['no'],                     // «НО!» — the short initial pickup shout; complaints follow every 3–5 seconds.
  dragComplaint: ['no', 'zaebal', 'eblan', 'ne_govori', 'stop', 'psihopat'],
  thrown: ['aaa'],                      // «А! А! А! Бля!»
  hitWall: ['ne_govori', 'blyat_nahuy'],   // «Не говори таких слов при мне, блядь», «Блядь, нахуй!»
  grabbedCursor: ['tancuem', 'druzhit', 'dai_ego', 'tsupa', 'habibi'],   // «Танцуем все!», «Дружить не хочешь?», «Дай его!»,
                                        // «Иди сюда, малыш!», «Хабиби!»
  wokenUp: ['molchat', 'vody_kofe'],    // «Молчать, блядь», «Воды, блядь, нахуй! И нахуй кофе!»
  clickSpam: ['eblan', 'klik', 'dolboeb'],   // «Блин, ты чё, еблан?», «…один ебаный клик», «Я что, на долбоёба похож?»
  // the mascot's own floor actions
  sit: ['dura'],                        // «Сядь, дура толстая!»
  sleep: ['bayu'],                      // «Ох, баёшечки, баёшечки…»
  stretch: ['den_shestoy', 'zhara'],    // «День шестой… будем идти вперёд», «Жара ебаная!»
  smoke: ['zhestko'],                   // «Блядь, это жёстко!» after the first drag
  hookah: ['poebat'],                   // «…Мне как-то поебать вообще» after the first pull
  spit: ['harchek'],                    // the real hawk and «тьфу», said as the scene starts so it lands on the release
  drunk: ['baba', 'baba_dyrka', 'polnaya', 'baba_suka', 'ne_zhri', 'krasny', 'shcheki'],   // after vodka or beer, kept down
  burger: ['detka', 'tolstaya_morda', 'kto_luchshiy'],   // bragging about the burger: «…сладкая конфетка», a full happy
                                        // face, «Кто лучший? Да я знаю»
  pizza: ['fu', 'pochemu', 'nasri'],    // the plastic pizza: «Что это за хуйня? Фу», «…попробуй говно на вкус»
  vomit: ['pizdec', 'drugaya_dyrka', 'govno_vonyaet'],   // «Да это пиздец!», «Он с другой дырки вылез», «Говно воняет»
  // desktop pranks
  folderPeek: ['eto_on', 'o_blyat', 'podozritelno'],   // peeks into a folder window: «Это он!», «О, блядь», a suspicious stare
  folderDragged: ['dai_ego', 'dai_dai'],         // chases the folder the user is dragging: «Дай его!», «Дай, блядь!»
  folderPush: ['nu_voznya'],                      // pushes a folder icon: «Ну, пошла возня»
  cursorFight: ['specnaz'],                       // boxes the cursor: «Работай, спецназ! Работай, спецназ!»
  foldersReset: ['ne_volnuysya', 'vse_budet'],    // folders put back: «Не волнуйся, маленький…», «Всё будет хорошо»
  cursorThrown: ['pyos', 'korova'],               // flings the cursor: «…пёс моя паршивая», «…корова ебаная!»
  searchAngry: ['zaebal', 'zhizn'],               // knocked off the search bar: «Заебал, урод ты заморский!»
  // now and then, to fill the silence
  chatter: [
    'angel', 'palaich', 'klyuch', 'tualet', 'monitor', 'bandera', 'pantera', 'kashiki', 'parashyut',
    'shut_master', 'kak_chlen', 'poroshki', 'pavlov', 'olivie', 'tiktoker', 'maks_summa', 'nastya', 'degradaciya',
    'sinyaki', 'gey', 'dron', 'lyahov', 'sverchki', 'mama_ptica', 'muzhika',
  ],
};

/** Triggers held back by a cooldown (seconds since the last phrase of the same group): a burst of files, or the
 *  mascot's own actions one after another, should not turn into a stream of talk. */
export const COOLDOWNS = {
  system: { seconds: 8, triggers: new Set([
    'folderCreated', 'fileDownloaded', 'screenshot', 'fileCreated', 'fileDeleted', 'massDelete',
    'browserLaunched', 'messengerLaunched', 'codeLaunched', 'appLaunched', 'appQuit',
  ]) },
  action: { seconds: 6, triggers: new Set(['sit', 'sleep', 'stretch', 'smoke', 'hookah', 'spit', 'drunk', 'vomit', 'burger', 'pizza']) },
};

// App names: macOS bundle names and Windows process names.
const BROWSERS = /chrome|chromium|safari|firefox|edge|msedge|opera|brave|vivaldi|yandex|^browser$|^arc$|orion|tor browser/i;
const MESSENGERS = /telegram|whatsapp|discord|viber|slack|signal|^messages$|teams|skype|vk messenger|zoom/i;
const CODE_TOOLS = /^code$|visual studio|cursor|xcode|terminal|iterm|warp|powershell|^cmd$|windowsterminal|idea|webstorm|pycharm|goland|clion|rider|android studio|sublime|zed|nova|fleet/i;
const SCREENSHOT = /^(screenshot|screen shot|снимок экрана|снимок|скриншот|screen recording|запись экрана)/i;

/** Names a system event `{ type, name, folder?, isDirectory? }` (from watcher.js) as a trigger, or null. */
export function classifySystemEvent({ type, name = '', folder, isDirectory }) {
  switch (type) {
    case 'fileCreated':
      if (isDirectory) return 'folderCreated';
      if (SCREENSHOT.test(name)) return 'screenshot';
      return folder === 'Downloads' ? 'fileDownloaded' : 'fileCreated';
    case 'fileDeleted': return 'fileDeleted';
    case 'appLaunched':
      if (BROWSERS.test(name)) return 'browserLaunched';
      if (MESSENGERS.test(name)) return 'messengerLaunched';
      if (CODE_TOOLS.test(name)) return 'codeLaunched';
      return 'appLaunched';
    case 'appQuit': return 'appQuit';
    default: return null;
  }
}

/** True once `count` hits land within `window` seconds; then it starts counting afresh. */
export class BurstCounter {
  constructor(count, window) {
    this.count = count;
    this.window = window;
    this.times = [];
  }

  hit(now) {
    this.times = [...this.times.filter((t) => now - t < this.window), now];
    if (this.times.length < this.count) return false;
    this.times = [];
    return true;
  }
}

/** Notices the user coming back: the cursor moves after standing still for `idleSeconds`. */
export class ReturnWatch {
  constructor(idleSeconds) {
    this.idleSeconds = idleSeconds;
    this.last = null;            // { x, y }
    this.stillSince = null;
  }

  /** Feed every cursor sample; returns true on the first move after a long pause. */
  update(cursor, now) {
    const moved = this.last !== null && Math.hypot(cursor.x - this.last.x, cursor.y - this.last.y) > 2;
    this.last = { x: cursor.x, y: cursor.y };
    if (this.stillSince === null) { this.stillSince = now; return false; }
    if (!moved) return false;
    const wasAway = now - this.stillSince >= this.idleSeconds;
    this.stillSince = now;
    return wasAway;
  }
}

/** Triggers that may cut off a phrase in progress (a throw usually comes right after the «НО!» of being picked up). */
export const INTERRUPTING = new Set(['pickedUp', 'thrown', 'folderDragged']);

const groupOf = (trigger) => Object.entries(COOLDOWNS).find(([, g]) => g.triggers.has(trigger))?.[0] ?? null;

/** Decides whether a triggered phrase may start now: not over another phrase (unless it interrupts), and not
 *  during its group's cooldown. */
export class TriggerGate {
  constructor(cooldowns = COOLDOWNS) {
    this.cooldowns = cooldowns;
    this.last = {};
  }

  /** A phrase the user asked for plays regardless; it still restarts its group's cooldown. */
  force(trigger, now) {
    const group = groupOf(trigger);
    if (group !== null) this.last[group] = now;
  }

  allow(trigger, now, isTalking, { repeat = false } = {}) {
    if (isTalking && (repeat || !INTERRUPTING.has(trigger))) return false;
    const group = groupOf(trigger);
    if (group === null) return true;
    if (now - (this.last[group] ?? -Infinity) < this.cooldowns[group].seconds) return false;
    this.last[group] = now;
    return true;
  }
}

/** Says when to fill the silence: at a random moment `minGap`…`maxGap` seconds after the last phrase, and only
 *  when the mascot may talk. */
export class ChatterClock {
  constructor(minGap, maxGap, random = Math.random) {
    this.minGap = minGap;
    this.maxGap = maxGap;
    this.random = random;
    this.due = null;
  }

  /** Call when anything was said, so chatter waits for a fresh quiet stretch. */
  heard(now) { this.due = now + this.minGap + this.random() * (this.maxGap - this.minGap); }

  /** True when it is time to say something; `canTalk` false (asleep, busy) puts it off without losing the turn. */
  isDue(now, canTalk) {
    if (this.due === null) this.heard(now);
    return canTalk && now >= this.due;
  }
}
