// Things the user does in the system that the mascot reacts to.
const EMOTES = { fileCreated: 'excited', fileDeleted: 'sad', fileOpened: 'surprised', appLaunched: 'happy', appQuit: 'sleepy' };

const CAPTIONS = {
  fileCreated: (n) => `Новый файл: ${n}`,
  fileDeleted: (n) => `Удалено: ${n}`,
  fileOpened: (n) => `Открыт: ${n}`,
  appLaunched: (n) => `Запущено: ${n}`,
  appQuit: (n) => `Закрыто: ${n}`,
};

/** @param type one of fileCreated, fileDeleted, fileOpened, appLaunched, appQuit */
export function describeEvent(type, name) {
  if (!(type in EMOTES)) throw new Error(`unknown system event: ${type}`);
  return { type, name, emote: EMOTES[type], caption: CAPTIONS[type](name) };
}
