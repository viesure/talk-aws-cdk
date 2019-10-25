create table data
(
  id               SERIAL PRIMARY KEY,
  timestamp        VARCHAR(128) NOT NULL,
  data             VARCHAR(256) NOT NULL
);
