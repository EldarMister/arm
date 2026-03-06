-- Таблица машин
CREATE TABLE IF NOT EXISTS cars (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  model            VARCHAR(100),
  year             VARCHAR(20),
  mileage          INTEGER DEFAULT 0,
  fuel_type        VARCHAR(100),
  transmission     VARCHAR(100),
  body_type        VARCHAR(100),
  body_color       VARCHAR(100),
  body_color_dots  TEXT[]  DEFAULT '{}',
  interior_color   VARCHAR(100),
  interior_color_dots TEXT[] DEFAULT '{}',
  location         VARCHAR(100),
  vin              VARCHAR(50),
  price_krw        BIGINT  DEFAULT 0,
  price_usd        NUMERIC(10,2) DEFAULT 0,
  commission       NUMERIC(10,2) DEFAULT 200,
  delivery         NUMERIC(10,2) DEFAULT 0,
  loading          NUMERIC(10,2) DEFAULT 0,
  unloading        NUMERIC(10,2) DEFAULT 0,
  storage          NUMERIC(10,2) DEFAULT 0,
  vat_refund       NUMERIC(10,2) DEFAULT 0,
  total            NUMERIC(10,2) DEFAULT 0,
  encar_url        TEXT,
  encar_id         VARCHAR(50),
  can_negotiate    BOOLEAN DEFAULT false,
  tags             TEXT[]  DEFAULT '{}',
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- Таблица фотографий
CREATE TABLE IF NOT EXISTS car_images (
  id         SERIAL PRIMARY KEY,
  car_id     INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Дополнительные колонки если не существуют
ALTER TABLE cars ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS transmission VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS body_type VARCHAR(100);

-- Индексы для быстрых фильтров
CREATE INDEX IF NOT EXISTS idx_cars_price_usd  ON cars(price_usd);
CREATE INDEX IF NOT EXISTS idx_cars_year       ON cars(year);
CREATE INDEX IF NOT EXISTS idx_cars_mileage    ON cars(mileage);
CREATE INDEX IF NOT EXISTS idx_cars_encar_id   ON cars(encar_id);
CREATE INDEX IF NOT EXISTS idx_car_images_car  ON car_images(car_id);

-- Опции фильтров (управляется через Админ → Фильтры)
CREATE TABLE IF NOT EXISTS filter_options (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(50)  NOT NULL,   -- brand, fuel, drive, body, color_body, color_interior
  name       VARCHAR(100) NOT NULL,
  color_hex  VARCHAR(20),
  border_hex VARCHAR(20),
  sort_order INTEGER DEFAULT 0
);

-- Конфигурация и статистика парсера
CREATE TABLE IF NOT EXISTS scraper_config (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  schedule       VARCHAR(20)  DEFAULT 'manual',   -- manual | hourly | daily
  daily_limit    INTEGER      DEFAULT 100,
  start_hour     INTEGER      DEFAULT 10,          -- час запуска daily (0-23)
  interval_hours INTEGER      DEFAULT 1,           -- каждые N часов (hourly)
  is_active      BOOLEAN      DEFAULT false,
  total_scraped  INTEGER      DEFAULT 0,
  today_scraped  INTEGER      DEFAULT 0,
  last_run       TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- Единственная строка конфига
INSERT INTO scraper_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
