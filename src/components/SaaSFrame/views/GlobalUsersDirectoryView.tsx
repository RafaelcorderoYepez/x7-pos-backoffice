import React, { useEffect, useMemo, useState } from 'react';
import { saasService } from '../../../services/saasService';
import type { CompanyRegistryItem } from '../../../types/company-registry';
import type { PlatformUser } from '../../../types/user';
import {
  ALL_ROLES,
  ALL_SCOPES,
  SCOPE_OPTIONS,
  USER_ROLE_OPTIONS,
  filterUsers,
  formatEnumLabel,
  getUserStatusBadgeClass,
  getUserStatusLabel,
} from '../../../lib/user-directory';
import {
  ConfirmStatusToggleDialog,
  StatusToggleButton,
} from '../../shared/StatusToggle';

export const ALL_COMPANIES = 'all';

const HEADER_CLASS =
  'px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]';
const SELECT_CLASS =
  'text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] px-3 py-2 focus:outline-none focus:border-[#ae001a]';

/**
 * Global Users Directory del panel SaaS: todos los usuarios de la plataforma (GET /users),
 * con su compañía y comercio. El directorio de cada compañía vive en el MerchantFrame.
 */
export const GlobalUsersDirectoryView: React.FC = () => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [companies, setCompanies] = useState<CompanyRegistryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [scopeFilter, setScopeFilter] = useState(ALL_SCOPES);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES);
  const [toggleTarget, setToggleTarget] = useState<PlatformUser | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const showError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    setToast({
      message:
        message === 'SESSION_EXPIRED'
          ? 'Session expired. Please refresh the page to sign in again.'
          : message,
      type: 'error',
    });
  };

  const loadDirectory = () => {
    setIsLoading(true);
    setFetchError(false);
    Promise.all([saasService.listPlatformUsers(), saasService.listCompanies()])
      .then(([platformUsers, companyList]) => {
        setUsers(platformUsers);
        setCompanies(companyList);
      })
      .catch((err) => {
        setFetchError(true);
        showError(err, 'Failed to load users');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadDirectory();
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const companyNames = useMemo(
    () => new Map(companies.map((company) => [company.id, company.name])),
    [companies],
  );

  const filteredUsers = useMemo(
    () =>
      filterUsers(users, searchQuery, roleFilter, scopeFilter).filter(
        (user) =>
          companyFilter === ALL_COMPANIES ||
          String(user.merchant?.companyId) === companyFilter,
      ),
    [users, searchQuery, roleFilter, scopeFilter, companyFilter],
  );

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const nextActive = !toggleTarget.isActive;
    setIsTogglingStatus(true);
    try {
      await saasService.setPlatformUserActive(toggleTarget.id, nextActive);
      setToast({
        message: nextActive ? 'User activated successfully' : 'User deactivated successfully',
        type: 'success',
      });
      setToggleTarget(null);
      loadDirectory();
    } catch (err) {
      setToggleTarget(null);
      showError(err, 'Failed to update user status');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-[#222222] px-6 py-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          GLOBAL USERS DIRECTORY
        </span>
        <span className="text-white/50 text-xs">
          {isLoading ? '...' : `${users.length} users`}
        </span>
      </div>

      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        {!isLoading && !fetchError && (
          <div className="px-4 py-3 border-b border-[#e8e2d8] bg-[#f8f3eb] flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search by username or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e2d8] bg-white text-[#1d1c17] placeholder:text-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
              />
            </div>
            <select
              aria-label="Company"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL_COMPANIES}>All Companies</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL_ROLES}>{ALL_ROLES}</option>
              {USER_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {formatEnumLabel(role)}
                </option>
              ))}
            </select>
            <select
              aria-label="Scope"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value={ALL_SCOPES}>{ALL_SCOPES}</option>
              {SCOPE_OPTIONS.map((scope) => (
                <option key={scope} value={scope}>
                  {formatEnumLabel(scope)}
                </option>
              ))}
            </select>
          </div>
        )}

        {isLoading && (
          <p className="px-6 py-12 text-center text-sm text-[#5f5e5e]">Loading users…</p>
        )}

        {fetchError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm font-semibold text-[#5f5e5e]">The users could not be loaded.</p>
            <button
              type="button"
              onClick={loadDirectory}
              className="px-4 py-2 bg-[#222222] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#ae001a]"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !fetchError && filteredUsers.length === 0 && (
          <p className="px-6 py-12 text-center text-sm font-semibold text-[#5f5e5e]">
            No users match your search criteria
          </p>
        )}

        {!isLoading && !fetchError && filteredUsers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className={HEADER_CLASS}>User</th>
                  <th className={HEADER_CLASS}>Company / Merchant</th>
                  <th className={HEADER_CLASS}>Role</th>
                  <th className={HEADER_CLASS}>Scope</th>
                  <th className={HEADER_CLASS}>Status</th>
                  <th className={`${HEADER_CLASS} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={user.isActive ? '' : 'opacity-75'}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-[#1d1c17]">{user.username ?? '—'}</p>
                      <p className="text-xs text-[#5f5e5e]">{user.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-[#1d1c17]">
                        {(user.merchant && companyNames.get(user.merchant.companyId)) ?? '—'}
                      </p>
                      <p className="text-xs text-[#5f5e5e]">{user.merchant?.name ?? '—'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#1d1c17]">
                      {formatEnumLabel(user.role)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#1d1c17]">
                      {formatEnumLabel(user.scope)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase ${getUserStatusBadgeClass(user.isActive)}`}
                      >
                        {getUserStatusLabel(user.isActive)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusToggleButton
                        status={user.isActive ? 'active' : 'inactive'}
                        entityLabel={user.email}
                        onClick={() => setToggleTarget(user)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toggleTarget && (
        <ConfirmStatusToggleDialog
          entityName={toggleTarget.email}
          direction={toggleTarget.isActive ? 'deactivate' : 'activate'}
          submitting={isTogglingStatus}
          onConfirm={handleConfirmToggle}
          onClose={() => setToggleTarget(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[110] px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-[#ae001a]'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};
