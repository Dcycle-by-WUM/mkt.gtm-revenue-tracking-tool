-- Higiene de etiquetas de país (reporte Davide, 10-jul): "Spain" y "ES"
-- aparecían como dos países distintos en filtros y pivots. Las vistas (0014)
-- ya normalizan `contacts.country_raw`, pero los valores YA ALMACENADOS en
-- `country_parsed` (campañas y contactos — p. ej. los que entraron por el
-- uploader de CSV de LinkedIn preguntando el país) y en `country_overrides`
-- tienen precedencia y se cuelan sin normalizar. Esta migración pasa todo lo
-- almacenado por normalize_country() para que la base converja a los códigos
-- canónicos; la app además normaliza al leer como cinturón (lib/regions.ts).

update campaigns
set country_parsed = normalize_country(country_parsed)
where country_parsed is not null
  and country_parsed != normalize_country(country_parsed);

update contacts
set country_parsed = normalize_country(country_parsed)
where country_parsed is not null
  and country_parsed != normalize_country(country_parsed);

update country_overrides
set country = normalize_country(country)
where country != normalize_country(country);

-- Recalcular las vistas con las etiquetas ya convergidas.
select refresh_kpi_views();
