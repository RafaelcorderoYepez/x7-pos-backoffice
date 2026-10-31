"""Genera move-map.tsv (origen -> destino) para la reorganización de src/ por categoría/aplicación.

Uso: python3 docs/restructure/build-move-map.py   (desde la raíz del repo)
Las reglas se evalúan en orden; gana la primera que coincide. Falla si algún archivo queda sin mapear.
Destino DELETE = el archivo se elimina (código sin uso).
"""
import os
import re
import sys

M = 'modules'
MF = 'components/MerchantFrame'
V = f'{MF}/views'
SF = 'components/SaaSFrame'

# (regex sobre la ruta relativa a src/, destino; \1.. y {name} = nombre de archivo)
RULES = [
    # --- Se eliminan: no los importa nadie ---
    (r'^pages/DashboardPage\.tsx$', 'DELETE'),
    (rf'^{V}/products-inventory/InventoryQuickLinks\.tsx$', 'DELETE'),

    # --- Se quedan donde están (entrypoints / infraestructura de build) ---
    (r'^(main\.tsx|App\.tsx|index\.css|tailwind\.css)$', '{path}'),
    (r'^test/', '{path}'),
    (r'^assets/', '{path}'),

    # --- shared: utilidades genéricas, sin dominio ---
    (r'^api/http(\.test)?\.ts$', 'shared/api/{name}'),
    (r'^lib/(api-error|email-validation(\.test)?|useModalDismiss|use-history-back-lock)\.ts$', 'shared/lib/{name}'),
    (r'^components/shared/', 'shared/components/{name}'),
    (rf'^{MF}/shared/(AppModal(\.test)?|SideDrawer|Toast|QuickLaunchPanel(\.test)?)\.tsx$', 'shared/components/{name}'),
    (rf'^{MF}/modals/QuickActionModals\.tsx$', 'shared/components/{name}'),
    (rf'^{V}/PlaceholderViews\.tsx$', 'shared/components/{name}'),

    # --- platform: lo que envuelve a todas las aplicaciones (auth, onboarding, frames, navegación) ---
    (r'^api/auth\.ts$', 'platform/auth/api/{name}'),
    (r'^types/auth\.ts$', 'platform/auth/types/{name}'),
    (r'^lib/(auth-storage|saas-auth-storage|login-validation|forgot-password(\.test)?|reset-password(-success)?(\.test)?)\.ts$', 'platform/auth/lib/{name}'),
    (r'^pages/(LoginPage|ForgotPasswordPage|ResetPasswordPage|ResetPasswordSuccessPage)(\.test)?\.tsx$', 'platform/auth/pages/{name}'),
    (r'^components/(AuthLayout|ProtectedRoute)\.tsx$', 'platform/auth/components/{name}'),
    (rf'^{SF}/auth/SaasLoginOverlay\.tsx$', 'platform/auth/components/{name}'),

    (r'^api/onboarding\.ts$', 'platform/onboarding/api/{name}'),
    (r'^types/onboarding\.ts$', 'platform/onboarding/types/{name}'),
    (r'^lib/(onboarding-form|onboarding-routes|onboarding-storage|use-onboarding-guard|admin-identity-validation(\.test)?|business-profile-validation(\.test)?)\.ts$', 'platform/onboarding/lib/{name}'),
    (r'^pages/onboarding/', 'platform/onboarding/pages/{name}'),
    (r'^components/onboarding/', 'platform/onboarding/components/{name}'),
    (r'^context/', 'platform/onboarding/context/{name}'),
    (r'^hooks/(use-onboarding|use-toast)\.ts$', 'platform/onboarding/hooks/{name}'),

    (r'^services/navigationService\.ts$', 'platform/navigation/{name}'),
    (r'^lib/module-nav-hubs(\.test)?\.ts$', 'platform/navigation/{name}'),
    (rf'^{V}/ModuleCommandHubView(\.test)?\.tsx$', 'platform/navigation/{name}'),

    (rf'^{MF}/(MerchantFrame\.tsx|merchant-routes(\.test)?\.tsx?)$', 'platform/merchant-frame/{name}'),
    (rf'^{V}/merchant-view-registry(\.test)?\.tsx$', 'platform/merchant-frame/{name}'),
    (rf'^{MF}/layout/', 'platform/merchant-frame/layout/{name}'),
    (rf'^{SF}/SaaSFrame\.tsx$', 'platform/saas-frame/{name}'),

    # ================= modules/<categoria>/<aplicacion>/ =================
    # --- Platform SaaS ---
    (rf'^{SF}/dashboard/', f'{M}/platform-saas/central-backoffice/views/dashboard/{{name}}'),
    (rf'^{V}/SaasDashboardView\.tsx$', f'{M}/platform-saas/central-backoffice/views/{{name}}'),
    (r'^services/saasService\.ts$', f'{M}/platform-saas/central-backoffice/api/saas-service.ts'),
    (r'^services/saasService\.test\.ts$', f'{M}/platform-saas/central-backoffice/api/saas-service.test.ts'),
    (rf'^{SF}/views/(OrdersRegistryView|MerchantSettlementsView)(\.test)?\.tsx$', f'{M}/platform-saas/central-backoffice/views/{{name}}'),
    (r'^types/settlements\.ts$', f'{M}/platform-saas/central-backoffice/types/{{name}}'),
    (r'^lib/settlements(\.test)?\.ts$', f'{M}/platform-saas/central-backoffice/lib/{{name}}'),

    (rf'^{MF}/dashboard/', f'{M}/platform-saas/client-backoffice/views/dashboard/{{name}}'),
    (r'^services/restaurantService\.ts$', f'{M}/platform-saas/client-backoffice/api/restaurant-service.ts'),

    (rf'^{SF}/views/CompanyRegistryView(\.test)?\.tsx$', f'{M}/platform-saas/companies/views/{{name}}'),
    (rf'^{V}/company-admin/(CompanyProfileView|CompanyConfigurationsView)(\.test)?\.tsx$', f'{M}/platform-saas/companies/views/{{name}}'),
    (rf'^{MF}/shared/CompanyProfileEditModal\.tsx$', f'{M}/platform-saas/companies/views/{{name}}'),
    (r'^api/companies\.ts$', f'{M}/platform-saas/companies/api/{{name}}'),
    (r'^types/(company|company-registry)\.ts$', f'{M}/platform-saas/companies/types/{{name}}'),
    (r'^lib/(company-registry|company-configurations|company-profile-navigation|company-form-validation)(\.test)?\.ts$', f'{M}/platform-saas/companies/lib/{{name}}'),

    (rf'^{V}/company-admin/MerchantDirectoryView(\.test)?\.tsx$', f'{M}/platform-saas/merchants/views/{{name}}'),
    (rf'^{MF}/shared/(MerchantEditModal|MerchantBranchSummaryModal)\.tsx$', f'{M}/platform-saas/merchants/views/{{name}}'),
    (r'^api/merchants\.ts$', f'{M}/platform-saas/merchants/api/{{name}}'),
    (r'^types/merchant\.ts$', f'{M}/platform-saas/merchants/types/{{name}}'),
    (r'^lib/(merchant-directory|merchant-directory-navigation|merchant-form-validation|merchant-profile-validation)(\.test)?\.ts$', f'{M}/platform-saas/merchants/lib/{{name}}'),

    (rf'^{SF}/views/(SubscriptionPlans|PlanApplications|PlanFeatures|PlatformApplications|PlatformFeatureCatalog|CompanySubscriptions)View(\.test)?\.tsx$', f'{M}/platform-saas/subscription-system/views/{{name}}'),
    (rf'^{SF}/views/SubscriptionPlanSelect\.tsx$', f'{M}/platform-saas/subscription-system/views/{{name}}'),
    (r'^types/subscription\.ts$', f'{M}/platform-saas/subscription-system/types/{{name}}'),

    (rf'^{V}/company-admin/UserManagementView(\.test)?\.tsx$', f'{M}/platform-saas/users/views/{{name}}'),
    (rf'^{SF}/views/GlobalUsersDirectoryView(\.test)?\.tsx$', f'{M}/platform-saas/users/views/{{name}}'),
    (rf'^{MF}/shared/UserEditModal\.tsx$', f'{M}/platform-saas/users/views/{{name}}'),
    (rf'^{MF}/modals/RolesAccessMatrixModal\.tsx$', f'{M}/platform-saas/users/views/{{name}}'),
    (r'^api/users\.ts$', f'{M}/platform-saas/users/api/{{name}}'),
    (r'^types/user\.ts$', f'{M}/platform-saas/users/types/{{name}}'),
    (r'^lib/(user-directory|user-directory-navigation|user-form-validation)(\.test)?\.ts$', f'{M}/platform-saas/users/lib/{{name}}'),

    # --- CORE ---
    (rf'^{V}/rule-config/', f'{M}/core/configuration/views/{{name}}'),
    (r'^types/configuration\.ts$', f'{M}/core/configuration/types/{{name}}'),
    (rf'^{V}/financial-engine/', f'{M}/core/financial-engine/views/{{name}}'),
    (r'^types/accounting\.ts$', f'{M}/core/financial-engine/types/{{name}}'),
    (rf'^{V}/accounts-payable/SuppliersView\.tsx$', f'{M}/core/business-partners/views/{{name}}'),

    # --- Finance & HR ---
    (rf'^{V}/accounts-payable/', f'{M}/finance-hr/accounts-payable/views/{{name}}'),
    (r'^types/accounts-payable\.ts$', f'{M}/finance-hr/accounts-payable/types/{{name}}'),
    (rf'^{V}/hr/', f'{M}/finance-hr/hr/views/{{name}}'),
    (rf'^{MF}/shared/UserHrSummaryModal\.tsx$', f'{M}/finance-hr/hr/views/{{name}}'),
    (r'^types/(collaborator|contract|time-entry)\.ts$', f'{M}/finance-hr/hr/types/{{name}}'),
    (r'^lib/(collaborators|contracts|time-entries)(\.test)?\.ts$', f'{M}/finance-hr/hr/lib/{{name}}'),

    # --- Inventory ---
    (rf'^{V}/products-inventory/(InventoryNavHubBar|InventoryQuickLinks)\.tsx$', f'{M}/inventory/shared/{{name}}'),
    (rf'^{V}/products-inventory/recipes/', f'{M}/inventory/food-costing/views/{{name}}'),
    (rf'^{V}/products-inventory/(RawMaterialsHubView\.tsx)$', f'{M}/inventory/raw-materials/views/{{name}}'),
    (rf'^{V}/products-inventory/category/RawMaterialCategoriesView\.tsx$', f'{M}/inventory/raw-materials/views/{{name}}'),
    (rf'^{V}/products-inventory/(raw-materials|purchase-order)/', f'{M}/inventory/raw-materials/views/{{name}}'),
    (rf'^{V}/products-inventory/stocks/(.+)$', f'{M}/inventory/raw-materials/views/stocks/\\1'),
    (rf'^{V}/products-inventory/', f'{M}/inventory/products-inventory/views/{{name}}'),

    # --- Restaurant Operations ---
    (rf'^{V}/dining-system/(.+)$', f'{M}/restaurant-operations/dining-system/views/\\1'),
    (r'^types/dining-system\.ts$', f'{M}/restaurant-operations/dining-system/types/{{name}}'),
    (r'^lib/(dining-realtime|dining-tables|floor-geometry|floor-plan-layout|table-assignments|measurement-units)(\.test)?\.ts$', f'{M}/restaurant-operations/dining-system/lib/{{name}}'),
    (r'^lib/useDiningRealtime\.ts$', f'{M}/restaurant-operations/dining-system/lib/{{name}}'),

    (rf'^{V}/restaurant-operations/kitchen-stations/', f'{M}/restaurant-operations/kitchen-display-system/views/{{name}}'),
    (r'^lib/kds-[a-z-]+(\.test)?\.ts$', f'{M}/restaurant-operations/kitchen-display-system/lib/{{name}}'),

    (rf'^{V}/restaurant-operations/(CashTipMovement\w*|Tip\w*|TipsLedgerView|TipsManagementQuickLinks)(\.test)?\.tsx$', f'{M}/restaurant-operations/tips/views/{{name}}'),
    (r'^api/(tips|tip-[a-z-]+|cash-tip-movements)(\.test)?\.ts$', f'{M}/restaurant-operations/tips/api/{{name}}'),
    (r'^types/(tips|tip-[a-z-]+|cash-tip-movement)\.ts$', f'{M}/restaurant-operations/tips/types/{{name}}'),

    (rf'^{V}/restaurant-operations/(Cash\w*|cash\w*Helpers)(\.test)?\.tsx?$', f'{M}/restaurant-operations/cash-drawers/views/{{name}}'),
    (r'^types/(cash-drawer|cash-drawer-history|cash-movement|cash-shift|cash-transaction)\.ts$', f'{M}/restaurant-operations/cash-drawers/types/{{name}}'),

    # Este test prueba TimeEntriesView: se renombra al moverlo.
    (rf'^{V}/restaurant-operations/AttendanceLedgerView\.test\.tsx$', f'{M}/restaurant-operations/shifts/views/TimeEntriesView.test.tsx'),
    (rf'^{V}/restaurant-operations/', f'{M}/restaurant-operations/shifts/views/{{name}}'),
    (r'^api/(shifts|attendance)\.ts$', f'{M}/restaurant-operations/shifts/api/{{name}}'),
    (r'^types/(shifts|attendance)\.ts$', f'{M}/restaurant-operations/shifts/types/{{name}}'),

    (rf'^{V}/reservations/', f'{M}/restaurant-operations/reservations/views/{{name}}'),
    (r'^api/reservations\.ts$', f'{M}/restaurant-operations/reservations/api/{{name}}'),
    (r'^types/reservation\.ts$', f'{M}/restaurant-operations/reservations/types/{{name}}'),
    (r'^lib/(reservations?|reservation-[a-z-]+)(\.test)?\.ts$', f'{M}/restaurant-operations/reservations/lib/{{name}}'),

    # --- Commerce ---
    (rf'^{V}/delivery/', f'{M}/commerce/delivery-management/views/{{name}}'),
    (r'^api/delivery[a-z-]*\.ts$', f'{M}/commerce/delivery-management/api/{{name}}'),
    (r'^types/delivery[a-z-]*\.ts$', f'{M}/commerce/delivery-management/types/{{name}}'),
    (r'^lib/delivery-[a-z-]+(\.test)?\.ts$', f'{M}/commerce/delivery-management/lib/{{name}}'),

    (rf'^{V}/commerce/(.+)$', f'{M}/commerce/online-ordering/views/\\1'),

    (rf'^{V}/qr-code/', f'{M}/commerce/qr-code/views/{{name}}'),
    # Todo api/lib/types qr-* es de QR Code (locations, menus, sections, items, orders, generator).
    (r'^api/qr-[a-z-]+(\.test)?\.ts$', f'{M}/commerce/qr-code/api/{{name}}'),
    (r'^types/qr-[a-z-]+\.ts$', f'{M}/commerce/qr-code/types/{{name}}'),
    (r'^lib/qr-[a-z-]+(\.test)?\.ts$', f'{M}/commerce/qr-code/lib/{{name}}'),
]

# Subcarpetas a conservar dentro de views/ cuando la regla usa {name} (las que usan \\1 ya conservan la suya).
KEEP_SUBDIRS = set()


def target(path):
    name = os.path.basename(path)
    parent = os.path.basename(os.path.dirname(path))
    for pattern, dest in RULES:
        m = re.search(pattern, path)
        if not m:
            continue
        if dest == 'DELETE':
            return dest
        out = m.expand(dest.replace('{path}', path).replace('{name}', name))
        # Conserva subcarpetas de producto (p. ej. products-inventory/variants/VariantsView.tsx).
        if '{name}' in dest and parent in KEEP_SUBDIRS and '/views/' in out:
            out = out.replace(f'/views/{name}', f'/views/{parent}/{name}')
        return out
    return None


def main():
    files = sorted(
        os.path.relpath(os.path.join(d, f), 'src')
        for d, _, fs in os.walk('src') for f in fs
    )
    rows, missing, seen = [], [], {}
    for f in files:
        t = target(f)
        if t is None:
            missing.append(f)
            continue
        if t in seen and t != 'DELETE':
            sys.exit(f'Destino duplicado: {t} <- {seen[t]} y {f}')
        seen[t] = f
        rows.append((f, t))
    if missing:
        sys.exit('Sin regla:\n  ' + '\n  '.join(missing))
    with open('docs/restructure/move-map.tsv', 'w') as out:
        out.write('from\tto\n')
        for f, t in rows:
            out.write(f'src/{f}\t{t if t == "DELETE" else "src/" + t}\n')
    deleted = sum(1 for _, t in rows if t == 'DELETE')
    moved = sum(1 for f, t in rows if f != t and t != 'DELETE')
    print(f'{len(rows)} archivos mapeados: {moved} se mueven, {deleted} se eliminan, {len(rows) - moved - deleted} se quedan.')


if __name__ == '__main__':
    main()
