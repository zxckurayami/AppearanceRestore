<img src="https://raw.githubusercontent.com/zxckurayami/AppearanceRestore/main/media/icon.png" width="256" height="256" alt="Appearance Restore icon">

# Appearance Restore

Актуальная версия: **1.1.2**

Appearance Restore — помощник для восстановления оформления Visual Studio Code
после обновления редактора или плагинов. Подключает **уже установленные** Vibrancy
Continued, Smooth UI, Doki Theme, Custom CSS and JS и, по отдельному выбору,
Fix Checksums Next. Перед изменениями создаёт резервные копии, сохраняет чужие
CSS/JS-импорты и предлагает восстановление через обычный интерфейс VS Code.

Русский и английский интерфейс. Без телеметрии, скрытого применения патчей
и принудительного перезапуска редактора.

## Что нового в 1.1.2

- Исправлены ссылки на стикер после перехода с локального издателя на Marketplace.
- Стикер заново создаётся в текущем хранилище из исходной картинки, даже если
  прежнее хранилище уже удалено.
- Исправляются также старые управляемые импорты Smooth UI.
- Посторонние CSS/JS-файлы и оригинальные изображения остаются нетронутыми.
- Для отсутствующего файла невыбранного компонента добавлено понятное сообщение
  на русском и английском.

Полный список изменений: [CHANGELOG.md](CHANGELOG.md).

## Возможности

- Обнаружение обновлений VS Code и поддерживаемых расширений оформления.
- Выбор компонентов и подтверждение перед восстановлением.
- Восстановление в определённом порядке, Fix Checksums только по желанию.
- Переподключение CSS и JavaScript из активной версии Smooth UI без дублирования.
- Локальный кастомный стикер Doki без повторного скачивания картинки.
- Проверка фактического встраивания CSS/JS, а не только возврата команды Loader.
- Резервные копии основных файлов редактора с контрольными суммами SHA-256.
- Сохранение предыдущих импортов и отмена собственных неиспользованных изменений
  при ошибке CSS-шага.
- Блокировка одновременного восстановления из нескольких окон.
- Журнал операций и быстрый доступ к резервным копиям.

## Скачать

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zxckurayami.appearance-restore) — установка и опубликованные обновления через VS Code.
- [GitHub Releases](https://github.com/zxckurayami/AppearanceRestore/releases) — готовые VSIX и контрольные суммы.

Версия в Marketplace может отличаться от последнего релиза GitHub: публикация
на этих площадках выполняется отдельно.

## Установка

В VS Code откройте расширения (`Ctrl+Shift+X`), найдите
`@id:zxckurayami.appearance-restore` и нажмите «Установить».

Для ручной установки скачайте `appearance-restore-1.1.2.vsix` из Releases,
выполните **Extensions: Install from VSIX** и выберите этот файл.

Нужен VS Code **1.96 или новее**, доверенная локальная рабочая область и хотя бы
один поддерживаемый плагин. Помощник не устанавливает сторонние расширения сам.

## Поддерживаемые плагины

| Плагин | Идентификатор | Для чего используется |
| --- | --- | --- |
| Vibrancy Continued | `illixion.vscode-vibrancy-continued` | Восстановление прозрачности и размытия |
| Doki Theme | `unthrottled.doki-theme` | Восстановление оформления Doki и кастомного стикера |
| Smooth UI | `gental.smoothui` | Подключение CSS и JavaScript текущей версии |
| Custom CSS and JS Loader | `be5invis.vscode-custom-css` | Применение CSS/JS; обязателен для Smooth UI и локального стикера |
| Fix Checksums Next | `RimuruChan.vscode-fix-checksums-next` | Пересчёт контрольных сумм, необязательный последний шаг |

Это независимый помощник, а не официальное расширение этих проектов.
Сторонние плагины, темы и изображения в дистрибутив не включаются.

## Как пользоваться

1. Установите нужные плагины оформления и настройте их для своего компьютера.
2. В палитре команд найдите **Appearance Restore: Восстановить оформление**
   (Restore Appearance в английском интерфейсе).
3. Выберите компоненты, подтвердите запуск и дождитесь окончания.
4. Если задан `doki.sticker.path`, кастомный стикер подключается автоматически
   из этого файла, без скачивания картинок Doki и без дополнительного диалога.
   Если кастомного пути нет, используется обычное восстановление Doki: дождитесь
   его сообщения и подтвердите завершение. При ошибке нажмите «Остановить».
5. Сохраните файлы, закройте все окна VS Code и откройте редактор заново.

Во время работы закрывайте уведомления сторонних плагинов о перезапуске,
не запускайте перезапуск до окончания всех шагов.

После первого запуска помощник запоминает версии редактора и плагинов.
При изменении версий появляется предложение восстановить оформление.
Кнопка «Позже» откладывает напоминание на сутки. Автоматических патчей нет.

## Что сохраняется

Перед запуском команд в globalStorage помощника создаётся отдельная копия
основных файлов VS Code с их путями, версией редактора и SHA-256.
Сохраняются также прежние CSS/JS-импорты пользователя. Изображение стикера
встраивается в управляемый скрипт в globalStorage; исходный файл не меняется.
Команда **Appearance Restore: Открыть резервные копии** открывает эту папку.
Это снимок основных файлов, а не полный установщик и не гарантия отката
всех изменений стороннего плагина. Старые копии автоматически не удаляются.

Помощник не заменяет файлы редактора самостоятельно, не восстанавливает
старые файлы поверх новой версии, не запускает оболочки, не требует
администратора, не отправляет данные и не перезапускает VS Code.
Сторонние плагины могут показывать собственные запросы и уведомления.

Fix Checksums по умолчанию не выбран: он пересчитывает контрольные суммы,
а не восстанавливает оформление. Его можно явно добавить последним шагом.
Оформление нельзя гарантировать при несовместимости плагинов с новой версией.

## Smooth UI и кастомный стикер

- Выберите **Smooth UI** в мастере. Он автоматически добавляет шаг Custom CSS,
  определяет активную установленную версию Smooth UI, заменяет её устаревшие
  импорты и подключает оба файла: CSS и JavaScript. Чужие импорты сохраняются.
- Используется тот же формат путей, что у самого Smooth UI: при следующем старте
  оно не добавит повторную копию JavaScript. Стили и код Smooth UI не изменяются.
  Его CSS может обращаться к внешним шрифтам, как и при обычной установке.
- Для локального стикера используются настройки User `doki.sticker.path` и
  `doki.sticker.css`. Поддерживаются PNG/JPEG/GIF/WebP до 16 МБ. Картинка не
  пересжимается, положение и размер берутся из безопасных CSS-свойств Doki.
- Для кастомного стикера сеть не нужна: это локальный слой совместимости через
  Custom CSS Loader, а не вызов сетевого установщика картинок Doki. Сам Doki
  может независимо обращаться к сети при собственной активации.
- Стикер не перехватывает клики. Он появляется после загрузки рабочей области
  и не дублируется при повторном выполнении скрипта.
- После команды Loader проверяется реальное содержимое workbench HTML: оба
  исходных файла Smooth UI и полный скрипт кастомного стикера должны быть встроены.
  При тихой ошибке Loader успех не отмечается. Если CSS ещё не применён,
  помощник отменяет собственное изменение импортов, не затирая чужие правки.

### Переход с локальной версии на Marketplace

Если после перехода с `zxckurayami-local` на `zxckurayami` появилась ошибка
отсутствующего `doki-sticker-*.js`, запустите восстановление и выберите Doki Theme.
При заданном `doki.sticker.path` стикер будет создан из исходной картинки в новом
хранилище. Для устаревших стилей выберите Smooth UI. Старое хранилище может уже
отсутствовать: восстанавливать его вручную не требуется. Исправляются только
созданные помощником файлы в хранилище прежнего издателя этого же профиля.
Посторонние импорты и оригинальные изображения не изменяются. Обновление
расширения само по себе не меняет настройки и не запускает восстановление.

## Ограничения

- Помощник не устанавливает и не включает отключённые расширения.
- Нужна доверенная локальная рабочая область и доступная на запись установка.
- Workspace-настройки оформления не должны переопределять User-настройки.
- Custom CSS: разрешены существующие локальные CSS/JS file-URL без переменных.
  Удалённые импорты помощник не загружает. После подтверждения изменяются
  только User-импорты CSS/JS. Прежние значения сохраняются в manifest.json
  резервной копии; остальные настройки, CSS/JS и исходные картинки не меняются.
- Сбой или ручной перезапуск в середине операции может оставить `restore.lock`.
  В этом случае закройте все окна VS Code, удалите только `restore.lock` в
  globalStorage этого помощника и откройте VS Code заново. Не удаляйте backups.
- Восстановление не проверяет визуальное совпадение темы: это нужно проверить
  после полного перезапуска. Запущенные команды могут обрабатывать свои ошибки
  через собственные уведомления, не выбрасывая исключение в помощник.

## Установка для разработки

Нужны Git, Node.js 24 и npm. Runtime-зависимостей у расширения нет.

```sh
git clone https://github.com/zxckurayami/AppearanceRestore.git
cd AppearanceRestore
npm test
```

Для установки готовой сборки используйте VSIX из Releases.

## Сборка расширения

```sh
npm run package
```

Команда создаёт папку `dist` и собирает VSIX через официальный `@vscode/vsce`.
При первом запуске npm загружает инструмент упаковки, поэтому для сборки нужен
интернет. Сама работа расширения дополнительных npm-пакетов не требует.

В пакет не включаются тесты, локальные предпросмотры, исходный SVG и файлы GitHub.
Папки `dist`, `node_modules`, кэши, логи, резервные копии и личные настройки
не коммитятся. Готовые VSIX публикуются отдельно в Releases.

## Проверки

`npm test` запускает 40 проверок: план восстановления, подтверждения, резервные
копии, блокировку окон, безопасные импорты, миграцию стикера, локализацию
и проверку внедрения CSS/JS. Тесты работают с изолированными временными файлами,
а не с рабочей установкой редактора.

В GitHub Actions настроены тесты на Windows, Linux и macOS и сборка VSIX на Linux.
Интеграционная проверка с настоящим Custom CSS Loader выполняется только при
наличии соответствующей локальной версии плагина; иначе она явно пропускается.
Успешные тесты не гарантируют визуальную совместимость сторонних расширений
с каждой версией редактора. Ручная проверка оформления проведена на Windows;
полный интерфейс на Linux и macOS пока не проверен.

## Технологии

- JavaScript / CommonJS.
- Visual Studio Code Extension API.
- Node.js: файловая система, локальные file-URL, SHA-256.
- Встроенный Node.js test runner.
- Официальный упаковщик `@vscode/vsce`.

## Обратная связь

Об ошибке можно сообщить через [GitHub Issues](https://github.com/zxckurayami/AppearanceRestore/issues).
Укажите версии VS Code, Appearance Restore и выбранных плагинов, систему
и текст ошибки. Не прикладывайте целиком настройки редактора, резервные копии,
токены или личные изображения. Как публиковать новую версию: [PUBLISHING.md](PUBLISHING.md).

## Лицензия

[MIT](LICENSE). Автор: [zxckurayami](https://github.com/zxckurayami).
Права на сторонние темы, расширения и изображения принадлежат их владельцам.

## English

Appearance Restore is a local VS Code appearance-restoration helper, not a
standalone theme. Install it from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=zxckurayami.appearance-restore)
or download a VSIX from [GitHub Releases](https://github.com/zxckurayami/AppearanceRestore/releases).
Supported appearance extensions must already be installed and configured.

Run **Appearance Restore: Restore Appearance**, select installed components and
confirm. Dismiss third-party restart notices until every step finishes. Doki's
standard restoration runs in the background, so acknowledge that step only after
it succeeds. A configured local Doki sticker is instead connected offline through
Custom CSS automatically. Select Smooth UI to repair its current CSS/JS imports.
Then save your work, close every editor window and reopen VS Code.

The helper detects editor/extension version changes, offers restoration and
backs up critical editor files first. No automatic patching, shell commands,
telemetry, extension installation or forced restarts. Fix Checksums is opt-in.
Third-party compatibility and visual results cannot be guaranteed. For an
interrupted operation, close all editor windows before removing only the helper's
`restore.lock`; keep its backups. Never copy old editor files over a new version.
User CSS imports can change only after confirmation, with their previous values
saved in the backup manifest. Original image and Smooth UI files are unchanged.

After moving from the former local publisher to the Marketplace version, select
Doki Theme to regenerate a custom sticker from `doki.sticker.path`, or Smooth UI
to repair its generated imports. The old storage may already be deleted. Only
known generated paths in the same profile are replaced; unrelated imports stay.
