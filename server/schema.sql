-- Таблица машин
CREATE TABLE IF NOT EXISTS cars (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  model            VARCHAR(100),
  year             VARCHAR(20),
  mileage          INTEGER DEFAULT 0,
  fuel_type        VARCHAR(100),
  transmission     VARCHAR(100),
  drive_type       VARCHAR(100),
  body_type        VARCHAR(100),
  trim_level       VARCHAR(120),
  key_info         VARCHAR(120),
  displacement     INTEGER DEFAULT 0,
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
  delivery_profile_code VARCHAR(60),
  loading          NUMERIC(10,2) DEFAULT 0,
  unloading        NUMERIC(10,2) DEFAULT 0,
  storage          NUMERIC(10,2) DEFAULT 0,
  pricing_locked   BOOLEAN DEFAULT false,
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
ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS body_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS trim_level VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS key_info VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS displacement INTEGER DEFAULT 0;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS delivery_profile_code VARCHAR(60);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS pricing_locked BOOLEAN DEFAULT false;

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

CREATE TABLE IF NOT EXISTS pricing_settings (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  commission        NUMERIC(10,2) DEFAULT 200,
  loading           NUMERIC(10,2) DEFAULT 0,
  unloading         NUMERIC(10,2) DEFAULT 100,
  storage           NUMERIC(10,2) DEFAULT 310,
  default_delivery  NUMERIC(10,2) DEFAULT 1450,
  whatsapp_number   VARCHAR(50) DEFAULT '821056650943',
  delivery_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO pricing_settings (
  id,
  commission,
  loading,
  unloading,
  storage,
  default_delivery,
  whatsapp_number,
  delivery_profiles
)
VALUES (
  1,
  200,
  0,
  100,
  310,
  1450,
  '821056650943',
  $$[
    {"code":"suv_big","label":"SUV BIG","description":"Highlander, Carnival","price":1800,"sort_order":10},
    {"code":"suv_middle","label":"SUV MIDDLE","description":"Santafe, Sorento","price":1700,"sort_order":20},
    {"code":"suv_small","label":"SUV SMALL","description":"Tivoli, Seltos","price":1600,"sort_order":30},
    {"code":"sedan_osh","label":"SEDAN OSH","description":"","price":1500,"sort_order":40},
    {"code":"sedan_bishkek","label":"SEDAN BISHKEK","description":"","price":1450,"sort_order":50},
    {"code":"sedan_lux","label":"SEDAN LUX","description":"","price":1600,"sort_order":60},
    {"code":"half_container","label":"HALF CONTAINER","description":"","price":3000,"sort_order":70},
    {"code":"mini_car","label":"MINI CAR","description":"Morning, Spark","price":1000,"sort_order":80}
  ]$$::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_codes (
  id         SERIAL PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  code       VARCHAR(6)  NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_sms_codes_phone_created_at ON sms_codes(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_codes_expires_at ON sms_codes(expires_at);
