# Этап 10 — CI и публикация

Выполнен 2026-10-06. Все этапы плана завершены.

Workflow Validate and deploy запускается на push всех веток и pull request. Node берётся из .nvmrc; npm ci, lint, тесты и build:pages предшествуют публикации. Только push в main загружает Pages artifact и развёртывает его через environment github-pages. Права pages:write/id-token:write ограничены deploy job. Concurrency последовательно выполняет workflow одной ref и исключает перезапись нового деплоя старым.

Wasm fetch использует cache: no-cache для повторной проверки HTTP-кеша; это покрыто loader-тестом. README описывает архитектуру, генератор, формулы, настройки, управление, ограничения, тему и команды. Workflow сохраняет build-info.json с revision для проверки автоматического обновления.

Локальная проверка после npm ci: lint, 25 тестов Wasm, 72 Angular/Vitest-теста и build:pages проходят; npm audit сообщает 0 уязвимостей. GitHub Pages включён с build_type workflow.

Первый push: коммит 8168d1a, [workflow 37485586750](https://github.com/vorjyga/fintech-dashboard/actions/runs/37485586750) завершился успешно: validate 57 с, deploy 35 с. Демо: https://vorjyga.github.io/fintech-dashboard/#/dashboard. build-info.json подтверждает revision 8168d1a504113da9eb5997997121837d25c456de.

На опубликованном сайте проверены Wasm/Worker, пять строк defaults, рост объёма, неизменность таблицы во время Pause, переход Settings с сохранением паузы, Apply 2/10/50 из паузы с автоматическим running, таблица из двух строк, Pause/Resume и reload #/settings с defaults 5/100/500. Ошибок браузера нет.

Второй push: коммит 01196bd добавил meta description страницы. [Workflow 37486088148](https://github.com/vorjyga/fintech-dashboard/actions/runs/37486088148) автоматически выполнил validate за 42 с и deploy за 11 с. Browser reload подтверждает новое описание и revision 01196bd00422b11e8a773c3484cd177fa1d47c10 в build-info.json; приложение работает, Settings показывает defaults. Ручной запуск или ручной деплой не выполнялись.

Репозиторий публичный: https://github.com/vorjyga/fintech-dashboard. Демо публичное: https://vorjyga.github.io/fintech-dashboard/#/dashboard. План и матрица требований отмечены выполненными; README содержит команды и решения для обсуждения. Формальная E2E-система и benchmark не добавлялись, как допускают ТЗ и план.
