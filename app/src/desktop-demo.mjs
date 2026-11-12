// Directed presentation timelines. Only these reviewed, complete clips may appear in demo exports.
export const DEMO_PHRASES = ['ty_tut', 'bystree', 'tancuem', 'zhivoy', 'normalno', 'ne_volnuysya'];

export const DESKTOP_DEMOS = [
  {
    name: 'desktop-roam', duration: 24, title: 'Сам себе занятие',
    actions: [
      { at: 0, kind: 'walk', x: 750, y: 40, run: true, label: 'Бежит через рабочий стол' },
      { at: 4, kind: 'jump', x: 660, y: 230, label: 'Прыгает поверх окон' },
      { at: 6, kind: 'walk', x: 180, y: 230, run: true, label: 'Исследует экран' },
      { at: 9, kind: 'jump', x: 180, y: 40, label: 'Возвращается на пол' },
      { at: 11, kind: 'sit', duration: 5, label: 'Присел отдохнуть' },
      { at: 17, kind: 'walk', x: 780, y: 40, run: true, label: 'И снова побежал' },
      { at: 20.2, kind: 'walk', x: 90, y: 40, run: true, label: 'Возвращается к началу' },
    ],
    speech: [{ at: 0.5, key: 'ty_tut' }, { at: 6, key: 'bystree' }, { at: 12, key: 'normalno' }, { at: 18, key: 'tancuem' }],
  },
  {
    name: 'desktop-day', duration: 48, title: 'Маленькая жизнь на экране',
    actions: [
      { at: 0, kind: 'walk', x: 690, y: 40, run: true, label: 'Утренняя пробежка' },
      { at: 4, kind: 'stretch', label: 'Зарядка целиком' },
      { at: 16.5, kind: 'walk', x: 440, y: 40, run: false, label: 'Пора подкрепиться' },
      { at: 20.5, kind: 'burger', label: 'Бургер: от первого до последнего укуса' },
      { at: 31, kind: 'sleep', duration: 12, label: 'Засыпает, спит и встаёт' },
      { at: 43.5, kind: 'walk', x: 90, y: 40, run: true, label: 'Проснулся — и снова побежал' },
    ],
    speech: [{ at: 0.5, key: 'ty_tut' }, { at: 6, key: 'tancuem' }, { at: 22, key: 'normalno' }, { at: 26.5, key: 'ne_volnuysya' }, { at: 44, key: 'zhivoy' }],
  },
];
