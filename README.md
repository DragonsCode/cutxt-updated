# CuTxT

Классификация узбекских документов на латинице и кириллице. FastAPI, React, SQLite.

Три метода:

- **Словарь** — взвешенные совпадения с ключами из базы.
- **Архивный анализ** — учитывает заголовок, основной текст и приложения; спорные результаты помечает для ручной проверки.
- **ML** — определяет общую тему. Текущая модель обучена на внешнем новостном корпусе, а не на архивных папках.

## Запуск

```bash
docker compose up --build
```

Интерфейс: `http://localhost:5173`, API: `http://localhost:8000`.

Без Docker, два терминала. Нужны Python 3.12 и Node.js 20+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm install
npm run dev
```

Фронтенд обращается к `http://localhost:8000`. Другой адрес задаётся через `VITE_API_URL` в `frontend/.env`.

Загрузите PDF, DOCX или вставьте текст. Для первых двух методов нужна SQLite-база с таблицами `tables` и `keys`. В истории доступны объяснение и экспорт результата. Оценки словарных методов не являются вероятностями.

## Модель и проверки

Модель и корпус не хранятся в Git. Чтобы обучить модель общих тем, выполните из каталога `backend`:

```powershell
pip install -r requirements-uzbek.txt
python -m ml.collect_uzbek
python -m ml.train_uzbek
```

Для своей модели используйте CSV с колонками `text,label` ([пример](backend/data/train_dataset.csv.example)):

```powershell
python -m ml.train --data data/your_dataset.csv --out models/ml_classifier.joblib
```

В этом обучении (версия 1.1) TF-IDF строит словарь и IDF только на обучающей части каждого разбиения для калибровки. Модель сохраняет SHA-256 входного CSV, версии Python и библиотек и сведения о том, на каких данных обучен TF-IDF. Модели версии 1.0 по-прежнему загружаются; для новой процедуры нужно переобучение. Для оценки качества нужна отдельная тестовая выборка без пересечения с обучающими данными, включая дубли и связанные документы.

API сначала ищет `models/transformer_classifier/` ([ноутбук обучения](notebooks/train_transformer_colab.ipynb)), затем `models/ml_classifier.joblib`. Другой путь задаётся через `ML_MODEL_PATH`. После обучения перезапустите API. Статус модели: `GET /ml/status`.

Тесты бэкенда: `python -m unittest discover -s tests -v` из `backend`. Они используют небольшие синтетические примеры и не скачивают модели. Проверка фронтенда: `npm run lint`, `npm test`, `npm run build`.

[Архивный метод](docs/archive-method.md) · [Обучение и результаты ML](docs/uzbek-model.md) · [Пример учительницы](docs/teacher-example-review.md).

MIT. Авторство основы и источники компонентов: [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
