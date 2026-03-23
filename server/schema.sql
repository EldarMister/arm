-- Таблица машин
CREATE TABLE IF NOT EXISTS cars (
  id               SERIAL PRIMARY KEY,
  listing_type     VARCHAR(20) NOT NULL DEFAULT 'main',
  name             VARCHAR(255) NOT NULL,
  model            VARCHAR(100),
  year             VARCHAR(20),
  mileage          INTEGER DEFAULT 0,
  fuel_type        VARCHAR(100),
  transmission     VARCHAR(100),
  drive_type       VARCHAR(100),
  drive_type_source VARCHAR(80),
  drive_type_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_type        VARCHAR(100),
  vehicle_class    VARCHAR(100),
  trim_level       VARCHAR(120),
  key_info         VARCHAR(120),
  displacement     INTEGER DEFAULT 0,
  body_color       VARCHAR(100),
  body_color_dots  TEXT[]  DEFAULT '{}',
  interior_color   VARCHAR(100),
  interior_color_source VARCHAR(80),
  interior_color_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  interior_color_dots TEXT[] DEFAULT '{}',
  warranty_company VARCHAR(120),
  warranty_body_months INTEGER,
  warranty_body_km BIGINT,
  warranty_transmission_months INTEGER,
  warranty_transmission_km BIGINT,
  option_features  TEXT[]  DEFAULT '{}',
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
  detail_flags     JSONB NOT NULL DEFAULT '{}'::jsonb,
  inspection_formats TEXT[] DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS parts (
  id                 SERIAL PRIMARY KEY,
  title              VARCHAR(255) NOT NULL,
  brand              VARCHAR(100),
  model              VARCHAR(100),
  generation_body    VARCHAR(120),
  year_range         VARCHAR(80),
  side_location      VARCHAR(120),
  category           VARCHAR(120),
  condition          VARCHAR(120),
  price              NUMERIC(10,2) DEFAULT 0,
  description        TEXT,
  article_number     VARCHAR(80),
  availability_text  VARCHAR(120),
  in_stock           BOOLEAN NOT NULL DEFAULT true,
  donor_vehicle      VARCHAR(255),
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS part_images (
  id         SERIAL PRIMARY KEY,
  part_id     INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Дополнительные колонки если не существуют
ALTER TABLE cars ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS transmission VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type_source VARCHAR(80);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS drive_type_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS body_type VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS vehicle_class VARCHAR(100);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS trim_level VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS key_info VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS displacement INTEGER DEFAULT 0;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS interior_color_source VARCHAR(80);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS interior_color_diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_company VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_body_months INTEGER;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_body_km BIGINT;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_transmission_months INTEGER;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS warranty_transmission_km BIGINT;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS delivery_profile_code VARCHAR(60);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS pricing_locked BOOLEAN DEFAULT false;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS option_features TEXT[] DEFAULT '{}';
ALTER TABLE cars ADD COLUMN IF NOT EXISTS enrich_checked_at TIMESTAMPTZ;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS enrich_last_status VARCHAR(20);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS enrich_last_error TEXT;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS enrich_last_encar_id VARCHAR(50);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS listing_type VARCHAR(20) NOT NULL DEFAULT 'main';
ALTER TABLE cars ADD COLUMN IF NOT EXISTS detail_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS inspection_formats TEXT[] DEFAULT '{}';

-- Индексы для быстрых фильтров
CREATE INDEX IF NOT EXISTS idx_cars_price_usd  ON cars(price_usd);
CREATE INDEX IF NOT EXISTS idx_cars_year       ON cars(year);
CREATE INDEX IF NOT EXISTS idx_cars_mileage    ON cars(mileage);
CREATE INDEX IF NOT EXISTS idx_cars_encar_id   ON cars(encar_id);
CREATE INDEX IF NOT EXISTS idx_cars_listing_type ON cars(listing_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_vin_unique
  ON cars (UPPER(BTRIM(vin)))
  WHERE vin IS NOT NULL
    AND UPPER(BTRIM(vin)) ~ '^[A-HJ-NPR-Z0-9]{17}$';
CREATE INDEX IF NOT EXISTS idx_car_images_car  ON car_images(car_id);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts(brand);
CREATE INDEX IF NOT EXISTS idx_parts_model ON parts(model);
CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_price ON parts(price);
CREATE INDEX IF NOT EXISTS idx_parts_in_stock ON parts(in_stock);
CREATE INDEX IF NOT EXISTS idx_part_images_part ON part_images(part_id);

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
  parse_scope    VARCHAR(20)  DEFAULT 'all',      -- all | imported | japanese | german
  daily_limit    INTEGER      DEFAULT 100,
  start_hour     INTEGER      DEFAULT 10,          -- час запуска daily (0-23)
  interval_hours INTEGER      DEFAULT 1,           -- каждые N часов (hourly)
  is_active      BOOLEAN      DEFAULT false,
  total_scraped  INTEGER      DEFAULT 0,
  today_scraped  INTEGER      DEFAULT 0,
  last_run       TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE scraper_config ADD COLUMN IF NOT EXISTS parse_scope VARCHAR(20) DEFAULT 'all';

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
  delivery_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS delivery_countries JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO pricing_settings (
  id,
  commission,
  loading,
  unloading,
  storage,
  default_delivery,
  whatsapp_number,
  delivery_countries,
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
    {"code":"kg","label":"Кыргызстан","flag":"🇰🇬","shipping_type":"container","sort_order":10,"is_default":true},
    {"code":"kz","label":"Казахстан","flag":"🇰🇿","shipping_type":"ro_ro","sort_order":20},
    {"code":"ru","label":"Россия","flag":"🇷🇺","shipping_type":"ro_ro","sort_order":30},
    {"code":"uz","label":"Узбекистан","flag":"🇺🇿","shipping_type":"ro_ro","sort_order":40},
    {"code":"tj","label":"Таджикистан","flag":"🇹🇯","shipping_type":"ro_ro","sort_order":50},
    {"code":"by","label":"Беларусь","flag":"🇧🇾","shipping_type":"ro_ro","sort_order":60},
    {"code":"az","label":"Азербайджан","flag":"🇦🇿","shipping_type":"ro_ro","sort_order":70},
    {"code":"ua","label":"Украина","flag":"🇺🇦","shipping_type":"ro_ro","sort_order":80},
    {"code":"ge","label":"Грузия","flag":"🇬🇪","shipping_type":"ro_ro","sort_order":90}
  ]$$::jsonb,
  $$[
    {"code":"mini_car","label":"MORNING / SPARK","description":"","price":1000,"prices":{"kg":1000},"sort_order":10},
    {"code":"sedan_bishkek","label":"Седан (Бишкек)","description":"","price":1450,"prices":{"kg":1450},"sort_order":20},
    {"code":"sedan_osh","label":"Седан (Ош)","description":"","price":1500,"prices":{"kg":1500},"sort_order":30},
    {"code":"sedan_lux","label":"Седан люкс","description":"LEXUS / HONDA / MERCEDES","price":1600,"prices":{"kg":1600},"sort_order":40},
    {"code":"suv_city","label":"Малый кроссовер","description":"STONIC / KONA / NIRO / VENUE / XM3","price":1550,"prices":{"kg":1550},"sort_order":50},
    {"code":"suv_small","label":"Компактный кроссовер","description":"SPORTAGE / TRAX / TIVOLI / CORANDO","price":1600,"prices":{"kg":1600},"sort_order":60},
    {"code":"suv_standard","label":"Кроссовер","description":"","price":1650,"prices":{"kg":1650},"sort_order":70},
    {"code":"suv_middle","label":"Средний кроссовер","description":"SANTA FE / QM6","price":1700,"prices":{"kg":1700},"sort_order":80},
    {"code":"suv_big","label":"Большой кроссовер","description":"REXTON (Sport / G4 / G5) / CARNIVAL / PALISADE","price":1800,"prices":{"kg":1800},"sort_order":90},
    {"code":"ray","label":"RAY","description":"","price":1400,"prices":{"kg":1400},"sort_order":100},
    {"code":"damas","label":"DAMAS","description":"","price":1400,"prices":{"kg":1400},"sort_order":110},
    {"code":"labo","label":"LABO","description":"","price":1200,"prices":{"kg":1200},"sort_order":120},
    {"code":"porter","label":"PORTER","description":"","price":1600,"prices":{"kg":1600},"sort_order":130},
    {"code":"porter_double_cab","label":"PORTER (двойная кабина)","description":"","price":2000,"prices":{"kg":2000},"sort_order":140},
    {"code":"starex","label":"STAREX","description":"","price":2000,"prices":{"kg":2000},"sort_order":150},
    {"code":"staria","label":"STARIA","description":"","price":2000,"prices":{"kg":2000},"sort_order":160},
    {"code":"carnival_hi_limousine","label":"CARNIVAL HI-LIMOUSINE","description":"","price":2000,"prices":{"kg":2000},"sort_order":170},
    {"code":"half_container","label":"ПОЛКОНТЕЙНЕРА","description":"","price":3000,"prices":{"kg":3000},"sort_order":180}
  ]$$::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  identifier      VARCHAR(120) PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_failed_at  TIMESTAMPTZ,
  blocked_until   TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_blocked_until ON admin_login_attempts(blocked_until);

CREATE TABLE IF NOT EXISTS maintenance_jobs (
  job_key         VARCHAR(80) PRIMARY KEY,
  status          VARCHAR(20) NOT NULL DEFAULT 'idle',
  last_started_at TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO maintenance_jobs (job_key)
VALUES ('weekly_catalog_maintenance')
ON CONFLICT (job_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_users (
  id            SERIAL PRIMARY KEY,
  login         VARCHAR(32) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_user_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_user_sessions_user_id ON app_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_user_sessions_expires_at ON app_user_sessions(expires_at);
