-- Таблица машин
CREATE TABLE IF NOT EXISTS cars (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  model            VARCHAR(100),
  year             VARCHAR(20),
  mileage          INTEGER DEFAULT 0,
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

-- Индексы для быстрых фильтров
CREATE INDEX IF NOT EXISTS idx_cars_price_usd  ON cars(price_usd);
CREATE INDEX IF NOT EXISTS idx_cars_year       ON cars(year);
CREATE INDEX IF NOT EXISTS idx_cars_mileage    ON cars(mileage);
CREATE INDEX IF NOT EXISTS idx_cars_encar_id   ON cars(encar_id);
CREATE INDEX IF NOT EXISTS idx_car_images_car  ON car_images(car_id);
