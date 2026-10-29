import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QRCodeNavHubBar } from './QRCodeNavHubBar';

describe('QRCodeNavHubBar Component', () => {
  it('renders all 7 sub-modules and handles navigation and active context', () => {
    const onNavigateMock = vi.fn();
    render(<QRCodeNavHubBar activeModule="order-items" onNavigate={onNavigateMock} />);

    expect(screen.getByRole('navigation', { name: /QR Code System Sub-Modules/i })).toBeInTheDocument();

    const expectedModules = [
      { id: 'qr-locations', label: 'QR LOCATIONS', path: '/qr-code/locations', featureId: 'qr-code-locations' },
      { id: 'qr-menus', label: 'QR MENUS', path: '/qr-code/menus', featureId: 'qr-code-menus' },
      { id: 'menu-sections', label: 'MENU SECTIONS', path: '/qr-code/menu-sections', featureId: 'qr-code-menu-sections' },
      { id: 'menu-items', label: 'MENU ITEMS', path: '/qr-code/menu-items', featureId: 'qr-code-menu-items' },
      { id: 'deployments', label: 'DEPLOYMENTS', path: '/qr-code/deployments', featureId: 'qr-code-deployments' },
      { id: 'qr-orders', label: 'QR ORDERS', path: '/qr-code/orders', featureId: 'qr-code-orders' },
      { id: 'order-items', label: 'ORDER ITEMS', path: '/qr-code/order-items', featureId: 'qr-order-items' },
    ];

    for (const mod of expectedModules) {
      const btn = screen.getByTestId(`nav-hub-${mod.id}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(mod.label);
      expect(btn).toHaveAttribute('data-path', mod.path);
      expect(btn).toHaveAttribute('data-feature-id', mod.featureId);
    }

    const orderItemsBtn = screen.getByTestId('nav-hub-order-items');
    expect(orderItemsBtn).toHaveAttribute('aria-current', 'page');
    expect(orderItemsBtn.className).toContain('bg-[#ae001a]');

    fireEvent.click(screen.getByTestId('nav-hub-qr-orders'));
    expect(onNavigateMock).toHaveBeenCalledWith('qr-code-orders');

    fireEvent.click(screen.getByTestId('nav-hub-qr-menus'));
    expect(onNavigateMock).toHaveBeenCalledWith('qr-code-menus');
  });
});
