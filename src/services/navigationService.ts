export interface NavFeature {
  id: string;
  name: string;
  applicationId: string;
  planId: number;
  isSaaS: boolean;
}

export interface NavApplication {
  id: string;
  name: string;
  categoryName: string;
  categoryIcon: string;
  categorySortOrder: number;
  features: NavFeature[];
}

export interface NavCategory {
  id: string; // Unique lowercase key (e.g., 'saas', 'core', 'finance')
  name: string;
  icon: string;
  sortOrder: number;
  applications: NavApplication[];
}

const parseTextFile = (text: string): string[][] => {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('Plan_id') && !line.startsWith('Application_Id') && !line.startsWith('Feature_Id'))
    .map(line => line.split('|'));
};

const MERCHANT_COMPANY_FEATURE_IDS = new Set([
  'company-profile',
  'company-configurations',
  'merchant-directory',
  'user-management',
]);

export const navigationService = {
  async loadAndParseNavigation(userPlanId: number, userRole: string): Promise<NavCategory[]> {
    try {
      // 1. Load the three database flat files from public/
      const [subsRes, appsRes, featsRes] = await Promise.all([
        fetch('/Subscriptions.txt').then(r => r.text()),
        fetch('/Applications.txt').then(r => r.text()),
        fetch('/Features.txt').then(r => r.text())
      ]);

      const subsData = parseTextFile(subsRes);
      const appsData = parseTextFile(appsRes);
      const featsData = parseTextFile(featsRes);

      // Subscription mapping if necessary
      const plansMap = new Map<number, string>();
      subsData.forEach(row => {
        if (row.length >= 2) {
          plansMap.set(parseInt(row[0]), row[1]);
        }
      });

      const isSaaSMode = userRole === 'SaaS Owner';
      const isGodMode = userRole === 'Super Admin (All Access)' || userRole === 'God Mode';

      // 2. Parse and filter features (L3)
      const features: NavFeature[] = featsData
        .map(row => {
          if (row.length < 5) return null;
          return {
            id: row[0],
            name: row[1],
            applicationId: row[2],
            planId: parseInt(row[3]),
            isSaaS: row[4] === '1'
          };
        })
        .filter((f): f is NavFeature => f !== null)
        .filter(f => {
          if (isGodMode) {
            // The Super Admin (All Access) role sees absolutely all menu options
            return true;
          }
          if (isSaaSMode) {
            // SaaS Owner sees only features marked as SaaS
            return f.isSaaS;
          } else {
            // company/merchants admin: visible on all merchant plans
            if (MERCHANT_COMPANY_FEATURE_IDS.has(f.id)) {
              return true;
            }
            // Merchant sees features if they are not exclusive to the SaaS Owner and fall into their plan
            const exclusiveSaaS = [
              'saas-dashboard',
              'companies-dashboard',
              'apps-config',
              'features-control',
              'plan-apps-rules',
              'plan-features-mapping',
              'sub-plans-core',
              'sub-apps-mapping'
            ];
            // The plans are CUMULATIVE (1 Quick Service ⊂ 2 Full Restaurant ⊂ 3
            // Enterprise), so a higher plan includes the features of the lower ones.
            // With the exact equality that existed here, a Full Restaurant was left without the
            // 36 features of plan 1—tables, products, categories, orders, customers—and
            // Those workspaces existed but there was no way to get to them from the menu.
            return !exclusiveSaaS.includes(f.id) && f.planId <= userPlanId;
          }
        });

      // 3. Parsear aplicaciones (L2)
      const applications: NavApplication[] = appsData
        .map(row => {
          if (row.length < 5) return null;
          return {
            id: row[0],
            name: row[1],
            categoryName: row[2],
            categoryIcon: row[3],
            categorySortOrder: parseInt(row[4]),
            features: [] as NavFeature[]
          };
        })
        .filter((app): app is NavApplication => app !== null);

      // Assign features to your applications (KDS and Products/Inventory open their operational hubs)
      applications.forEach(app => {
        if (app.id === 'kitchen-display-system') {
          app.features = [
            {
              id: 'kds-dashboard',
              name: 'KDS Operational Command Hub',
              applicationId: 'kitchen-display-system',
              planId: 1,
              isSaaS: false,
            }
          ];
        } else if (app.id === 'shifts') {
          app.features = [
            {
              id: 'shifts-hub',
              name: 'Shifts Command Hub',
              applicationId: 'shifts',
              planId: 2,
              isSaaS: false,
            }
          ];
        } else if (app.id === 'tips') {
          app.features = [
            {
              id: 'tips-hub',
              name: 'Tips Command Hub',
              applicationId: 'tips',
              planId: 2,
              isSaaS: false,
            }
          ];
        } else if (app.id === 'configuration') {
          app.features = [
            {
              id: 'configuration-hub',
              name: 'Configuration Command Hub',
              applicationId: 'configuration',
              planId: 2,
              isSaaS: false,
            }
          ];
        } else if (app.id === 'products-inventory') {
          app.features = [
            {
              id: 'inventory-dashboard',
              name: 'Products Operational Command Hub',
              applicationId: 'products-inventory',
              planId: 1,
              isSaaS: false,
            }
          ];
        } else if (app.id === 'raw-materials') {
          app.features = [
            {
              id: 'raw-materials-dashboard',
              name: 'Raw Materials Operational Command Hub',
              applicationId: 'raw-materials',
              planId: 1,
              isSaaS: false,
            }
          ];
        } else {
          app.features = features.filter(f => f.applicationId === app.id);
        }
      });

      // Empty Parent Suppression Rule (Level 2: Applications without valid features)
      const visibleApps = applications.filter(app => app.features.length > 0);

      // 4. Group applications into categories (L1)
      const categoriesMap = new Map<string, NavCategory>();

      visibleApps.forEach(app => {
        const catId = app.categoryName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!categoriesMap.has(catId)) {
          categoriesMap.set(catId, {
            id: catId,
            name: app.categoryName,
            icon: app.categoryIcon,
            sortOrder: app.categorySortOrder,
            applications: []
          });
        }
        categoriesMap.get(catId)!.applications.push(app);
      });

      // Convert to array and sort by Category_SortOrder
      const categoriesList = Array.from(categoriesMap.values()).sort(
        (a, b) => a.sortOrder - b.sortOrder
      );

      return categoriesList;
    } catch (error) {
      console.error('Error loading and parsing navigation menu:', error);
      return [];
    }
  }
};
