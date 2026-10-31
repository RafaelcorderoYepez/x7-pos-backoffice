# Reorganización de `src/` por categoría y aplicación

## Objetivo

Que cada aplicación de [Applications.txt](../../public/Applications.txt) tenga **una sola carpeta** con todo lo suyo (api, tipos, lógica y vistas), agrupada por categoría. Hoy esas piezas están repartidas en carpetas técnicas planas (`api/`, `types/`, `lib/`, `components/MerchantFrame/views/...`).

Para decidir a qué aplicación pertenece cada archivo se usó [Features.txt](../../public/Features.txt) (feature → Application_Id). Se contrastó con la tabla feature → aplicación → `backend_key` del backend: las 124 features coinciden.

En tres casos la aplicación del frontend no es igual al módulo del backend. Igual se agrupan **por aplicación**, porque así está organizado el menú:

| Feature | Aplicación (carpeta) | Módulo backend |
|---|---|---|
| `raw-materials`, `raw-material-categories` | `inventory/raw-materials` | `PRODUCT_MANAGEMENT` |
| `locations` | `inventory/raw-materials` | `STOCK_AND_STOCK_MOVEMENTS` |
| `cash-shifts`, `cash-movements` | `restaurant-operations/cash-drawers` | `CASH_DRAWERS` |

## Estructura final

```
src/
├── main.tsx, App.tsx, index.css, tailwind.css   (sin cambios)
├── assets/                                       (sin cambios)
├── test/                                         (sin cambios: setup de vitest)
│
├── shared/            Utilidades genéricas, sin dominio de negocio
│   ├── api/           http.ts (cliente HTTP base)
│   ├── lib/           api-error, email-validation, useModalDismiss, use-history-back-lock
│   └── components/    AppModal, SideDrawer, Toast, QuickLaunchPanel, StatusToggle,
│                      TableOptionsMenu, NavHubBar, HeaderQuickTabs, StandardDashboardHub,
│                      ErrorBoundary, PlaceholderViews, QuickActionModals
│
├── platform/          Lo que envuelve a todas las aplicaciones
│   ├── auth/          login, forgot/reset password, auth-storage, ProtectedRoute, SaasLoginOverlay
│   ├── onboarding/    flujo de alta (pages, components, context, hooks, validaciones)
│   ├── navigation/    navigationService, module-nav-hubs, ModuleCommandHubView
│   ├── merchant-frame/ MerchantFrame, merchant-routes, merchant-view-registry, layout/
│   └── saas-frame/    SaaSFrame
│
└── modules/                       ✅ desarrollada · ◐ parcial · ⏳ pendiente de desarrollo
    ├── platform-saas/
    │   ├── central-backoffice/   ✅ dashboard SaaS, Orders Registry, Merchant Settlements, saas-service
    │   ├── client-backoffice/    ◐  dashboard del merchant, restaurant-service · falta Reports
    │   ├── companies/            ✅ Company Registry, Company Profile, Company Configurations
    │   ├── merchants/            ◐  Merchant Directory, modales de merchant · falta Provisioning
    │   ├── subscription-system/  ◐  Plans, Plan Applications/Features, Applications, Feature Catalog, Company Subscriptions
    │   └── users/                ✅ User Management, Global Users Directory, UserEditModal, RolesAccessMatrixModal
    ├── core/
    │   ├── billing-transactions/ ⏳ pendiente de desarrollo (Receipts)
    │   ├── configuration/        ✅ Tax / Tip / Overtime / Payroll Rules  (antes rule-config)
    │   ├── financial-engine/     ✅ Ledger Accounts, Journal Entries
    │   └── business-partners/    ◐  Suppliers (antes en accounts-payable) · falta Customers
    ├── finance-hr/
    │   ├── accounts-payable/     ✅ Supplier invoices, payments, credit notes, allocations
    │   ├── hr/                   ✅ Collaborators, Contracts, Time Entries, UserHrSummaryModal
    │   └── payrolls/             ⏳ pendiente de desarrollo
    ├── inventory/
    │   ├── shared/                  InventoryNavHubBar (común a la categoría)
    │   ├── food-costing/         ◐  Recipes · faltan costos teórico/real e ingredientes
    │   ├── products-inventory/   ✅ Products, Categories, Variants, Modifiers, hub
    │   └── raw-materials/        ✅ Raw Materials, categorías, Purchase Orders, stocks/
    ├── restaurant-operations/
    │   ├── dining-system/        ✅ Tables, Floor Plans, Zones, Assignments, floor-plan-editor/
    │   ├── kitchen-display-system/ ✅ todo lo de kitchen-stations + lib/kds-*
    │   ├── pos/                  ⏳ pendiente de desarrollo (Orders)
    │   ├── cash-drawers/         ✅ Cash Drawers, History, Shifts, Movements, Transactions
    │   ├── shifts/               ✅ Shift Assignment, Swaps, Open Shifts, Gantt, Time Clock Kiosk
    │   ├── tips/                 ✅ Tips, Pools, Members, Allocations, Settlements, Cash Tip Movements
    │   ├── reservations/         ✅
    │   └── table-turnover/       ⏳ pendiente de desarrollo
    ├── commerce/
    │   ├── delivery-management/  ✅
    │   ├── online-ordering/      ◐  online-menus/, online-stores/, hub · faltan 6 features
    │   └── qr-code/              ✅ Locations, Menus, Sections, Items, Orders, Order Items, Deployments
    └── growth/
        ├── loyalty-system/       ⏳ pendiente de desarrollo
        └── marketing-system/     ⏳ pendiente de desarrollo
```

Dentro de cada aplicación se usan, solo cuando hacen falta, estas subcarpetas: `api/`, `types/`, `lib/` y `views/`. Cada test se queda junto al archivo que prueba.

El árbol incluye las 29 aplicaciones del catálogo. Las marcadas ⏳ todavía no tienen código: su carpeta se crea cuando empiece su desarrollo (git no guarda carpetas vacías), siguiendo la ruta que indica el árbol. El detalle por feature está en [Estado de desarrollo por aplicación](#estado-de-desarrollo-por-aplicación).

## Estado de desarrollo por aplicación

Corte al 2026-10-31. Una feature cuenta como ✅ si ya tiene una vista propia en el backoffice. Si solo muestra una pantalla de "In Development" o de relleno, cuenta como ⏳. Este estado refleja el frontend y no confirma que el endpoint del backend esté completo.

**Resumen:** 17 aplicaciones desarrolladas, 6 parciales y 6 pendientes. De las 124 features hay 80 ✅ y 44 ⏳.

### Platform SaaS

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| central-backoffice | ✅ | saas-dashboard | — |
| client-backoffice | ◐ | (dashboard del merchant, sin feature en el catálogo) | reports |
| companies | ✅ | companies-dashboard, company-profile, company-configurations | — |
| merchants | ◐ | merchant-directory | merchants-provisioning |
| subscription-system | ◐ | apps-config, features-control, merchant-subs-link (suscripciones por compañía), plan-apps-rules, plan-features-mapping, sub-plans-core | sub-apps-mapping, sub-payments-billing |
| users | ✅ | user-management, users-auth-profiles (Global Users Directory) | — |

### CORE

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| billing-transactions | ⏳ | — | receipt-items, receipt-orders, receipt-taxes |
| configuration | ✅ | merchant-overtime-rules, merchant-payroll-rules, merchant-tax-rules, merchant-tips-rules | — |
| financial-engine | ✅ | journal-entries, journal-entries-lines, ledger-accounts | — |
| business-partners | ◐ | suppliers | customers |

### Finance & HR

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| accounts-payable | ✅ | supplier-credit-notes, supplier-invoice-items, supplier-invoices, supplier-payment-items, supplier-payments, supplier-payments-allocation | — |
| hr | ✅ | collaborators, collaborators-contracts, collaborators-time-entries | — |
| payrolls | ⏳ | — | payroll-adjustments, payroll-entries, payroll-runs, payroll-tax-detail |

### Inventory

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| food-costing | ◐ | recipes | actual-cost-variance, recipe-ingredients, theoretical-cost |
| products-inventory | ✅ | categories, products, variants, modifiers | — |
| raw-materials | ✅ | purchase-orders, stock-movements, raw-materials, raw-material-categories, locations | — |

### Restaurant Operations

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| dining-system | ✅ | floor-plans, table-assignments, table-zones, tables | — |
| kitchen-display-system | ✅ | kitchen-display-devices, kitchen-event-log, kitchen-order-items, kitchen-orders, kitchen-stations | — |
| pos | ⏳ | — | orders, order-items, order-item-modifiers, order-discounts, order-taxes, order-payments |
| cash-drawers | ✅ | cash-drawer-history, cash-drawers, cash-shifts, cash-transactions, cash-movements | — |
| shifts | ✅ | shift-assignment, shifts | — |
| tips | ✅ | tip-movements, tip-pool-members, tip-settlements, tips, tips-allocations, tips-pools | — |
| reservations | ✅ | reservations, reservation-guests, reservation-notes, reservation-status-history, reservation-tables | — |
| table-turnover | ⏳ | — | table-turnover |

### Commerce

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| delivery-management | ✅ | delivery-assignments, delivery-drivers, delivery-fees, delivery-tracking, delivery-zones | — |
| online-ordering | ◐ | online-menus, online-stores | online-delivery-info, online-menu-categories, online-menu-items, online-order-items, online-orders, online-payments |
| qr-code | ✅ | qr-code-locations, qr-code-menus, qr-code-menu-sections, qr-code-menu-items, qr-code-orders, qr-order-items | — |

### Growth

| Aplicación | Estado | Features ✅ | Features ⏳ pendientes de desarrollo |
|---|---|---|---|
| loyalty-system | ⏳ | — | loyalty-programs, loyalty-tiers, loyalty-customers, loyalty-point-transactions, loyalty-rewards, loyalty-rewards-redemptions, loyalty-coupons |
| marketing-system | ⏳ | — | marketing-segment, marketing-segment-rule, marketing-campaign, marketing-campaign-audience, marketing-coupon, marketing-coupon-redemption, marketing-automation, marketing-automation-action, marketing-message-log |

## Criterios de ubicación

| Caso | Decisión |
|---|---|
| Lo usan varias aplicaciones y no tiene dominio | `shared/` |
| Es infraestructura del producto (sesión, alta, marcos, menú) | `platform/` |
| Es común solo a las aplicaciones de una categoría | `modules/<categoria>/shared/` |
| Pertenece a una feature de Features.txt | la aplicación de esa feature |

Casos que cambian de lugar:
- `rule-config/*` → `core/configuration` (features `merchant-*-rules`).
- `SuppliersView` → `core/business-partners` (feature `suppliers`).
- `RecipesView` → `inventory/food-costing` (feature `recipes`).
- Raw materials, purchase orders y stocks → `inventory/raw-materials` (features `raw-materials`, `purchase-orders`, `stock-movements`, `locations`).
- `CashTipMovement*` → `restaurant-operations/tips` (feature `tip-movements`).
- `company-admin/*` se reparte entre `companies`, `merchants` y `users`.
- `OrdersRegistryView` y `MerchantSettlementsView` (SaaSFrame) → `central-backoffice`: son vistas de la plataforma y no tienen feature propia en Features.txt.
- `services/saasService.ts` → `central-backoffice/api/saas-service.ts`; `services/restaurantService.ts` → `client-backoffice/api/restaurant-service.ts`. Desaparece la carpeta `services/`.
- `hooks/use-toast.ts` y `context/` → `platform/onboarding`: solo los usa el onboarding.

## Mapa archivo por archivo

[move-map.tsv](move-map.tsv) lista los 542 archivos de `main` al 2026-10-31 con su ruta de origen y de destino: 531 se mueven, 2 se eliminan (destino `DELETE`) y 9 se quedan donde están. Lo genera [build-move-map.py](build-move-map.py):

```
python3 docs/restructure/build-move-map.py
```

El script se detiene con error si algún archivo queda sin regla o si dos archivos van al mismo destino. Si se agregan archivos antes de ejecutar la migración, basta con volver a correrlo.

## Plan de ejecución (con el desarrollo detenido)

1. Crear la rama `refactor/src-by-application` desde `main` actualizado.
2. Agregar el alias `@/` → `src/` en `tsconfig.app.json` y `vite.config.ts` (vitest lo hereda).
3. Regenerar `move-map.tsv`, mover cada archivo con `git mv` para conservar el historial y eliminar con `git rm` los marcados como `DELETE`.
4. Reescribir los imports con un script que use el mapa: cada import relativo que apunte a un archivo movido pasa a `@/...`. Los imports entre archivos de una misma carpeta pueden quedar relativos (`./X`).
5. Actualizar las rutas de `vi.mock(...)` en los tests, los specs de `e2e/` que importen desde `src/` y los demás `scripts/`.
6. Verificar con `npx tsc -b`, `npm run lint`, `npm test`, `npm run build` y `npm run test:e2e`.
7. Abrir un único PR que solo mueva archivos y actualice imports, **sin cambios de lógica**, y mergearlo antes de retomar el desarrollo.
8. Avisar al equipo que hagan `git pull` antes de crear ramas nuevas.

Duración estimada: medio día, incluida la verificación.

## Decisiones tomadas

- Las carpetas de categoría usan kebab-case, igual que los Application_Id: `platform-saas`, `core`, `finance-hr`, `inventory`, `restaurant-operations`, `commerce`, `growth`.
- **El nombre de cada carpeta `modules/<categoría>/<aplicación>` es el `code` de esa aplicación en el catálogo de navegación del menú dinámico** (documento "Menú dinámico y permisos X7-POS"). Si el nombre visible cambia (por ejemplo, `central-backoffice` se muestra como "Platform SaaS Dashboard" o `products-inventory` como "Products"), el `code` y la carpeta se mantienen.
- Esta reorganización es la **fase 0** del menú dinámico: se ejecuta antes, para que lo nuevo (hub genérico, login único, cliente de navegación) nazca en `platform/`. Su equivalente en el backend está descrito en ese mismo documento.
- Se **eliminan** `pages/DashboardPage.tsx` (el dashboard del SaaS Owner ya vive en `central-backoffice`) y `products-inventory/InventoryQuickLinks.tsx`. Ninguno de los dos se importa en ningún lado.
- `restaurant-operations/AttendanceLedgerView.test.tsx` se **renombra** a `shifts/views/TimeEntriesView.test.tsx`, porque prueba esa vista.
