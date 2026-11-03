# CuTxT

Веб-приложение для классификации текстов и документов (PDF, DOCX). Два режима:

- **Словарь (эталон)** — сопоставление с загруженной SQLite-эталонной базой.
- **ML** — либо CPU demo на `scikit-learn` (TF-IDF + логистическая регрессия), либо transformer-модель, обученная на GPU в Google Colab и запускаемая в API на CPU.

Стек: **FastAPI** + **SQLAlchemy** (метаданные в SQLite), **React** + **Vite** + **Mantine**.

## Требования

- **Docker** и **Docker Compose** *или*
- **Python 3.12** (рекомендуется; для 3.14 часто нет готовых wheel у `scipy`, установка может потребовать сборку из исходников)
- **Node.js 20+** и **npm** — для локального фронтенда

## Быстрый старт: Docker Compose

Из корня репозитория:

```bash
docker compose up --build
```

- **Фронт:** http://localhost:5173  
- **API:** http://localhost:8000  
- **Проверка API:** http://localhost:8000/health  

Данные метаданных API в Compose хранятся в volume `db-data` (путь в контейнере задаётся `DATABASE_URL`).

Переменные окружения бэкенда (см. `docker-compose.yml`): `DATABASE_URL`, `CORS_ORIGINS`, `MAX_UPLOAD_BYTES`, `ML_MODEL_PATH` (необязательно; если не задана, API сначала ищет `backend/models/transformer_classifier`, затем `backend/models/ml_classifier.joblib`).

## Локальный запуск (два терминала)

### Бэкенд

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

По умолчанию создаётся `sqlite:///api.db` в каталоге `backend`. Загруженные эталоны и файлы документов — в `backend/databases/` и `backend/documents/` (каталоги создаются при работе API).

### Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Откройте http://localhost:5173 . Запросы к API идут на `http://localhost:8000`, если не задано иное.

### URL API из браузера (другой хост или порт)

Создайте `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Для доступа к дев-серверу по LAN в `package.json` уже указано `vite --host 0.0.0.0`.

## ML-модель

В репозитории **не хранятся** реальные датасеты и натренированные модели. После клонирования проект стартует, но ML-режим будет недоступен, пока вы не положите свою модель в `backend/models/` или не зададите `ML_MODEL_PATH`.

API умеет загружать два типа ML-артефактов:

- `backend/models/transformer_classifier/` — каталог с `meta.json`, tokenizer files и transformer-весами.
- `backend/models/ml_classifier.joblib` — fallback на `scikit-learn`.

Статус активной модели: `GET /ml/status`.

### Формат обучающего CSV

```bash
text,label
"Пример текста документа 1",class_a
"Пример текста документа 2",class_b
```

В репозитории есть шаблон: `backend/data/train_dataset.csv.example`.

### Рекомендуемый путь: transformer-модель

Готовый ноутбук: `notebooks/train_transformer_colab.ipynb`.

Новый trainer сохраняет transformer-модель каталогом:

```bash
cd backend
source .venv/bin/activate
python -m ml.train_transformer --data data/your_dataset.csv --out-dir models/transformer_classifier
```

Если модель лежит в `backend/models/transformer_classifier`, API подхватит её автоматически. Иначе укажите путь через `ML_MODEL_PATH`:

```bash
ML_MODEL_PATH=models/transformer_classifier
```

Что делает новый pipeline:

- использует `distilbert-base-multilingual-cased`;
- оставляет текст почти сырым: trim + нормализация пробелов;
- объединяет метки с `<10` примерами в `Other`;
- делит датасет в пропорции `80/10/10`;
- сохраняет `meta.json`, `label_mapping.json` и `metrics.json`.

После обучения **перезапустите** `uvicorn` или контейнер бэкенда.

### Альтернатива: scikit-learn demo

```bash
cd backend
source .venv/bin/activate
python -m ml.train --data data/train_dataset.csv.example --out models/ml_classifier.joblib
```

Этот путь CPU-only и подходит скорее для быстрых локальных экспериментов.

## Сборка фронтенда для продакшена

```bash
cd frontend
npm run build
```

Артефакты — в `frontend/dist/`. Раздачу статики и проксирование к API настройте на своём reverse proxy.

## Лицензия

MIT License


## Offline regression tests and calibration scope

From `backend/`, run `python -m unittest discover -s tests -v`. Tests train only
small synthetic CPU examples or mock transformer loading; they do not download a
checkpoint, access an external service or establish classification accuracy.

For newly trained scikit-learn bundles (metadata version 1.1), probability
calibration wraps the complete TF-IDF + logistic-regression pipeline. Each
calibration fold learns its vocabulary and IDF from that fold's training documents
only. Uncalibrated small-data training still fits the full supplied training set.
The bundle records the input CSV SHA-256, package/Python versions and feature-fit
scope. Existing version 1.0 bundles remain loadable, but must be retrained to use
the corrected procedure; no old model scores have been replaced or reinterpreted.

Calibration folds are not an independent final evaluation. Before making quality
claims, define lawful data provenance, keep duplicate/related documents in the same
partition, hold out a final test set and report class coverage and metrics there.
The synthetic tests do not validate calibration on a real-world population.
