# Этап 2: интеграция Wasm

Выполнен 2026-10-06.

## Реализовано

- AssemblyScript 0.28.9 закреплён в package.json и lock-файле.
- Минимальный `assembly/index.ts` экспортирует `abiVersion()` со значением 1; компилятор экспортирует линейную память.
- `asconfig.json` содержит debug/release targets. Debug-бинарник и WAT помещаются в `assembly/build`; release-бинарник — в `public/wasm/market.wasm`.
- `build:wasm` действительно компилирует оба модуля перед start/build/test. Angular копирует release-бинарник в production assets.
- Worker создан Angular CLI; используется отдельный `tsconfig.worker.json`. Избыточная опция, добавленная schematic к Vitest target и не поддерживаемая его схемой, удалена.
- URL бинарника построен относительно `document.baseURI` и передаётся в команду start.
- Загрузка выполняется через fetch с проверкой HTTP-статуса, затем через `WebAssembly.instantiate(ArrayBuffer, imports)`.
- Проверяются экспорты памяти и версии ABI. Ошибки fetch, instantiate, ABI, AssemblyScript abort и native Worker отображаются пользователю.
- Корневой сервис использует RxJS для событий Worker и readonly Signal для статуса. Навигация сохраняет один Worker; Retry, ошибки и уничтожение приложения освобождают ресурсы.
- Незавершённая загрузка прежнего запуска отменяется; старые результаты не отправляются и не принимаются новым запуском.

## Проверки

| Проверка | Результат |
| --- | --- |
| `npm ci` | Успешно; 0 найденных уязвимостей. |
| `npm test` | 2 Node-теста настоящих debug/release бинарников и 16 тестов Vitest проходят. |
| Ошибки и жизненный цикл | HTTP 404, offline, invalid binary, missing exports, incompatible ABI, abort, cancellation, stale load, base URI, Worker cleanup и Retry покрыты тестами. |
| `npm run lint` | Успешно. |
| `npm run build` | Успешно; Worker и Wasm включены в production output. |
| `npm run build:pages` | Успешно; base href `/fintech-dashboard/`. |
| Браузер в корне сайта | Реальный модуль выполняется; статус `WebAssembly ready · ABI 1`. |
| Браузер в подпапке Pages | Worker выполняется; сервер подтверждает HTTP 200 для `/fintech-dashboard/wasm/market.wasm`. |
| Навигация Dashboard → Settings | Готовность сохраняется; дополнительный Worker не загружается. |
| HTTP-ошибка в браузере | При временно убранном generated asset показывается `Could not download the market module: HTTP 404`. |
| Восстановление в браузере | После восстановления asset кнопка Retry возвращает статус ready. |

## Границы этапа

Модуль пока содержит только память и версию ABI. Методы init/generateBatch/getBatchLength, PRNG и генерация рыночных обновлений реализуются на этапе 3. Pause/Resume, накопление метрик и Apply пока не реализованы. Начальные settings и seed передаются как часть согласованного протокола, но минимальный модуль их ещё не использует.

`WasmAbiExports` описывает минимальный контракт этапа 2; `MarketWasmExports` расширяет его полным контрактом генератора для этапа 3. Это позволяет проверять реально существующие экспорты без фиктивных методов генерации.

Документация: [AssemblyScript compiler](https://www.assemblyscript.org/compiler.html), [Angular CLI web-worker](https://angular.dev/cli/generate/web-worker).
