-- 120 kuru koşusunun İLK parçası: tohumdan ÖNCE demo salonun kuyruktaki
-- bildirim isteği sayısı (`tohum_sessiz_regression.sql` bununla karşılaştırır).
CREATE TEMP TABLE _q0 AS
SELECT count(*) AS n
  FROM net.http_request_queue q
 WHERE position((SELECT id::text FROM public.organizations WHERE slug = 'demo-luera')
                in convert_from(q.body, 'UTF8')) > 0;
