# MUD RING — правила работы в проекте

## Git
- **Новые файлы сразу добавлять в индекс** (`git add`): всё, что создано в репозитории
  (исходники, картинки, файлы сборки в `docs/`), кроме того, что закрыто `.gitignore`
  (временные файлы — в `.tmp/`).
- Коммитит и пушит пользователь сам — коммит и пуш только по его просьбе.

## Сборка
- После изменений в `index.html`, `src/`, `img/`, `pwa/` или `questions.json` пересобрать: `python3 build.py` → `docs/`.
- `questions.json` — копия `../mudracing/questions.json`: при добавлении вопросов обновлять оба файла.

## Связь с MUD RACING (`../mudracing`)
- Сервер рекордов общий: `../mudracing/server` (маршруты `/ring/scores`, таблица `ring_scores`).
  `npx wrangler deploy` и изменения живой базы D1 выполняет пользователь.
- Обе игры на одном домене GitHub Pages: общий `localStorage` и Cache Storage —
  ключи `mudring.*`, кэш service worker с префиксом `mudring-`. Не трогать ключи `mudracing.*`,
  кроме чтения `mudracing.cid` (общий id игрока) и имени.
