# Этап 10 — CI и публикация

Workflow Validate and deploy запускается на push всех веток и pull request. Node берётся из .nvmrc; npm ci, lint, тесты и build:pages предшествуют публикации. Только push в main загружает Pages artifact и развёртывает его через environment github-pages. Права pages:write/id-token:write ограничены deploy job. Concurrency последовательно выполняет workflow одной ref и исключает перезапись нового деплоя старым.

Wasm fetch использует cache: no-cache для повторной проверки HTTP-кеша; это покрыто loader-тестом. README описывает архитектуру, генератор, формулы, настройки, управление, ограничения, тему и команды. Workflow сохраняет build-info.json с revision для проверки автоматического обновления.

Локальная проверка после npm ci: lint, 25 тестов Wasm, 72 Angular/Vitest-теста и build:pages проходят; npm audit сообщает 0 уязвимостей. GitHub Pages включён с build_type workflow.

Первый push: коммит 8168d1a, [workflow 37485586750](https://github.com/vorjyga/fintech-dashboard/actions/runs/37485586750) завершился успешно: validate 57 с, deploy 35 с. Демо: https://vorjyga.github.io/fintech-dashboard/#/dashboard. build-info.json подтверждает revision 8168d1a504113da9eb5997997121837d25c456de.

На опубликованном сайте проверены Wasm/Worker, пять строк defaults, рост объёма, неизменность таблицы во время Pause, переход Settings с сохранением паузы, Apply 2/10/50 из паузы с автоматическим running, таблица из двух строк, Pause/Resume и reload #/settings с defaults 5/100/500. Ошибок браузера нет.

Проверочный push добавляет meta description страницы. После него будут проверены новый revision и описание в опубликованном HTML без ручного запуска workflow.
