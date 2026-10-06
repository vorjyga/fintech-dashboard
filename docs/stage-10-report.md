# Этап 10 — CI и публикация

Workflow Validate and deploy запускается на push всех веток и pull request. Node берётся из .nvmrc; npm ci, lint, тесты и build:pages предшествуют публикации. Только push в main загружает Pages artifact и развёртывает его через environment github-pages. Права pages:write/id-token:write ограничены deploy job. Concurrency последовательно выполняет workflow одной ref и исключает перезапись нового деплоя старым.

Wasm fetch использует cache: no-cache для повторной проверки HTTP-кеша; это покрыто loader-тестом. README описывает архитектуру, генератор, формулы, настройки, управление, ограничения, тему и команды. Workflow сохраняет build-info.json с revision для проверки автоматического обновления.

Локальная проверка после npm ci: lint, 25 тестов Wasm, 72 Angular/Vitest-теста и build:pages проходят; npm audit сообщает 0 уязвимостей. GitHub Pages включён с build_type workflow.

Публикация и browser smoke: ожидают выполнения первого workflow и последующего проверочного push. Итоговые ссылки и результаты будут добавлены после проверки.
