-- Reinicio + semillas de la base de PRUEBAS (nunca la de desarrollo) para delivery-real.spec.ts.
-- Requiere que el onboarding ya haya creado el comercio 1 y el usuario 1 (ver README.md).
TRUNCATE delivery_tracking, delivery_assignments, delivery_fees, delivery_drivers, delivery_zones RESTART IDENTITY CASCADE;
DELETE FROM orders;
DELETE FROM customer;
DELETE FROM collaborator;
DELETE FROM "table";

INSERT INTO "table" (merchant_id, number, capacity, status, location) VALUES (1, 'D-1', 2, 'available', 'Delivery counter');
INSERT INTO collaborator (user_id, merchant_id, name, role) VALUES (1, 1, 'Counter Staff', 'waiter');
INSERT INTO customer (name, email, rut, address, city, state, country, "merchantId")
VALUES ('Ana Perez', 'ana@example.com', '11.111.111-1', 'Av Apoquindo 3000', 'Santiago', 'RM', 'Chile', 1);

-- 5 pedidos a domicilio listos en cocina (E2E-0001 … E2E-0005), ids 1-5.
SELECT setval(pg_get_serial_sequence('orders', 'id'), 1, false);
INSERT INTO orders (merchant_id, table_id, collaborator_id, type, status, customer_id, order_number, subtotal, total,
                    delivery_address, kitchen_status, ready_at)
SELECT 1, (SELECT id FROM "table" LIMIT 1), (SELECT id FROM collaborator LIMIT 1), 'delivery', 'pending',
       (SELECT id FROM customer LIMIT 1), 'E2E-' || lpad(g::text, 4, '0'), 25 + g, 25 + g, addr, 'ready', now()
  FROM (VALUES (1, 'Av Providencia 1500, Providencia'), (2, 'Calle Suecia 120, Providencia'),
               (3, 'Av Italia 900, Nunoa'), (4, 'Av Vitacura 2800, Las Condes'),
               (5, 'Merced 340, Santiago Centro')) AS v(g, addr);

-- Suscripción activa con todas las funcionalidades: sin plan, las rutas con @RequireFeature
-- (p. ej. GET /orders) responden 402 y el drawer de asignaciones no puede listar pedidos.
INSERT INTO feature (id, name, description, "Unit", status)
SELECT g, 'Feature ' || g, 'E2E feature ' || g, 'unit', 'active' FROM generate_series(1, 120) g
ON CONFLICT (id) DO NOTHING;
INSERT INTO subscription_plan (name, description, "billingCycle", status)
SELECT 'E2E Full', 'Plan de pruebas con todas las funcionalidades', 'monthly', 'active'
WHERE NOT EXISTS (SELECT 1 FROM subscription_plan WHERE name = 'E2E Full');
INSERT INTO plan_features (limit_value, status, subscription_plan_id, feature_id)
SELECT 0, 'active', p.id, f.id FROM subscription_plan p CROSS JOIN feature f
 WHERE p.name = 'E2E Full'
   AND NOT EXISTS (SELECT 1 FROM plan_features pf WHERE pf.subscription_plan_id = p.id AND pf.feature_id = f.id);
INSERT INTO company_subscription (company_id, "startDate", "endDate", status, payment_method, plan_id)
SELECT 1, CURRENT_DATE - 1, CURRENT_DATE + 365, 'active', 'card', (SELECT id FROM subscription_plan WHERE name = 'E2E Full')
WHERE NOT EXISTS (SELECT 1 FROM company_subscription WHERE company_id = 1 AND status = 'active');

-- Administrador de plataforma para el panel SaaS (/saas-admin sólo admite portal_admin).
-- Contraseña: E2ePass123 (hash bcrypt, coste 10). Sólo para la base de PRUEBAS.
INSERT INTO users (username, password, email, role, scope, "isActive", "merchantId")
SELECT 'e2e_portal', '$2b$10$s45QFJaB/v2DtSKL6kGhYe9vX7WRSeGdR8dqoEvyAGMTh1D9cQP/i', 'portal@x7delivery-e2e.com', 'portal_admin', 'admin_portal', true, 1
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'portal@x7delivery-e2e.com');
