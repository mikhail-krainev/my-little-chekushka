<div align="center">

# 🍾 Чекушка

**Пиксельный маскот на рабочем столе для macOS и Windows**

Человек-бутылка «Чекушка Мировая №67» гуляет по рабочему столу поверх всех окон.<br>
Без чатов, без нейросетей, без интернета и без каких-либо ключей: приложение полностью локальное.

[![Release](https://img.shields.io/github/v/release/mikhail-krainev/my-little-chekushka?style=flat-square&color=4c1)](https://github.com/mikhail-krainev/my-little-chekushka/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/mikhail-krainev/my-little-chekushka/build.yml?style=flat-square&label=build)](https://github.com/mikhail-krainev/my-little-chekushka/actions/workflows/build.yml)
![Platforms](https://img.shields.io/badge/platform-macOS%2011%2B%20%7C%20Windows%2010%2F11-lightgrey?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)

<br>

<a href="https://github.com/mikhail-krainev/my-little-chekushka/releases/download/v1.0.4/Chekushka-1.0.4-win-x64.exe"><img alt="Скачать для Windows" src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-Windows%20x64-0078D6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0wIDBoMTEuNHYxMS40SDB6TTEyLjYgMEgyNHYxMS40SDEyLjZ6TTAgMTIuNmgxMS40VjI0SDB6TTEyLjYgMTIuNkgyNFYyNEgxMi42eiIvPjwvc3ZnPg%3D%3D"></a>
<a href="https://github.com/mikhail-krainev/my-little-chekushka/releases/download/v1.0.4/Chekushka-1.0.4-mac-arm64.pkg"><img alt="Скачать для macOS Apple Silicon" src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-macOS%20Apple%20Silicon-000000?style=for-the-badge&logo=apple&logoColor=white"></a>
<a href="https://github.com/mikhail-krainev/my-little-chekushka/releases/download/v1.0.4/Chekushka-1.0.4-mac-x64.pkg"><img alt="Скачать для macOS Intel" src="https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-macOS%20Intel-555555?style=for-the-badge&logo=apple&logoColor=white"></a>

<sub>Версия 1.0.4 · <a href="https://github.com/mikhail-krainev/my-little-chekushka/releases">все версии</a></sub>

<br><br>

<img src="docs/screenshots/poses.png" alt="Позы маскота">

</div>

---

## 📦 Установка

### 🪟 Windows 10/11

1. Скачайте `Chekushka-…-win-x64.exe` (кнопка выше или раздел Assets на странице [Releases](https://github.com/mikhail-krainev/my-little-chekushka/releases/latest)).
2. Запустите файл. Если Windows пишет «Система Windows защитила ваш компьютер», нажмите **Подробнее → Выполнить в любом случае** (установщик не подписан сертификатом).
3. Установка проходит в один клик, без прав администратора. После неё маскот запускается сам, на рабочем столе появляется ярлык «Chekushka».
4. Значок в системном трее (возле часов, может прятаться под стрелкой ^) открывает меню действий и выход.

Удалить: «Параметры → Приложения → Chekushka → Удалить».

### 🍎 macOS (11 и новее)

1. Скачайте `.pkg` для своего процессора: `…-mac-arm64.pkg` для Apple Silicon (M1 и новее), `…-mac-x64.pkg` для Intel. Узнать свой: меню  → «Об этом Mac».
2. Откройте `.pkg`. Если macOS пишет, что не может проверить разработчика, нажмите на файл правой кнопкой → **Открыть** → **Открыть** (или «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть»).
3. Пройдите установщик: «Продолжить» → «Установить» (потребуется пароль от Mac).
4. Запустите **Chekushka** из «Программы» (Launchpad или Spotlight). В Dock значка не будет: значок появится в строке меню справа вверху, через него выбираются действия и «Выход».

Удалить: перетащить Chekushka из «Программ» в корзину.

### 🛟 Если маскот не появился

- Проверьте значок в строке меню (macOS) или в трее (Windows): он есть, значит приложение запущено.
- Запускать можно только один экземпляр: сначала закройте старый через «Выход».
- Не работает? Откройте [Issues](https://github.com/mikhail-krainev/my-little-chekushka/issues) и опишите систему и что видите.

---

## ✨ Что умеет

- Ходит, бегает, приседает и прыгает, прыгает к курсору и повисает на нём (быстро дёрните мышь, чтобы стряхнуть).
- Его можно схватить мышью и бросить: он летит по физике и приземляется.
- Клик по нему — реплика в облачке.
- Занятия на «полу» (случайно или из меню):
  - сесть и зевнуть, спать лёжа на боку;
  - зарядка: круги руками, наклоны, приседания, прыжки;
  - чекушка 0,2 л и пиво 0,5 л: открыть, выпить, «брр», покачаться, с шансом 50 % стошнить, бросить бутылку;
  - плюнуть в экран: плевок попадает в случайную точку, стекает каплями и высыхает.
- Пустая бутылка разбивается об пол, осколки и брызги разлетаются по рабочему столу и через 5 секунд исчезают.
- Реагирует на новые и удалённые файлы в `Desktop`, `Documents`, `Downloads` и на запуск и закрытие приложений: подпрыгивает, но ничего не комментирует.

| Выпивка и последствия | Плевок |
|---|---|
| ![Выпивка](docs/screenshots/drinks.png) | ![Плевок](docs/screenshots/spit.png) |

<details>
<summary>Разбитое стекло</summary>

![Стекло](docs/screenshots/glass.png)

</details>

## 🔒 Приватность

Приложение ничего не отправляет в сеть. Оно только читает имена файлов, которые появились или исчезли в трёх папках выше, и названия запущенных приложений, чтобы маскот мог отреагировать. Имена нигде не показываются и не сохраняются.

## 🛠 Запуск из исходников

Нужен [Node.js](https://nodejs.org) 20+.

```bash
cd app
npm install
npm start                    # запуск
npm start -- --demo vodka    # сразу начать действие: vodka | beer | sit | sleep | stretch | spit
npm test                     # тесты логики анимации и физики стекла
npm run screenshots          # перерисовать картинки для README в docs/screenshots
```

Сборка установщиков (на нужной системе):

```bash
npm run dist:mac    # .pkg для macOS (arm64 и x64)
npm run dist:win    # установщик .exe для Windows
```

Тот же результат даёт GitHub Actions ([.github/workflows/build.yml](.github/workflows/build.yml)): на каждый тег `v*` собираются обе системы и файлы прикладываются к релизу. Новый релиз: `git tag v1.0.1 && git push origin v1.0.1`.

## 🧩 Устройство

```
app/                  кроссплатформенное приложение (Electron), его собирают для macOS и Windows
  main.js             окно-прозрачный слой на весь экран, трей, слежение за экраном
  watcher.js          файлы (fs.watch) и запущенные приложения
  src/                логика и отрисовка
    animator.mjs      чистые функции: время → поза
    controller.mjs    «жизнь»: состояния, физика, мышь, курсор
    renderer.mjs      сборка маскота из спрайтов, лицо, эффекты
    shatter.mjs       физика стекла и плевков
  assets/sprites/     детали маскота (тело, руки, ноги)
  test/               тесты (node --test)
macos-native/         первоначальная нативная версия на Swift/AppKit (только macOS)
tools/make_sprites.py нарезка спрайтов из исходной картинки
docs/screenshots/     картинки для README
```

Окно приложения прозрачное, на весь экран и пропускает клики сквозь себя. Мышь оно перехватывает только пока курсор над самим маскотом.
