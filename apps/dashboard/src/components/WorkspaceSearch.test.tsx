import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSearch } from './WorkspaceSearch';
import { api } from '../lib/api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(permissions: string[]) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><WorkspaceSearch permissions={permissions} onClose={vi.fn()}/></MemoryRouter></QueryClientProvider>);
}
describe('universal workspace search', () => {
  it('searches permitted record sources and links contacts to their filtered list', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 'contact-1', email: 'alex@example.test' }] });
    setup(['contacts:read']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'alex' } });
    const link = await screen.findByRole('link', { name: 'alex@example.test Contact' });
    expect(link.getAttribute('href')).toBe('/audience?search=alex%40example.test');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/v1/contacts?limit=8&search=alex');
    expect(screen.queryByRole('link', { name: 'API Keys Page' })).toBeNull();
  });
  it('keeps page matches available when record search fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Unavailable'));
    setup(['contacts:read']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'contacts' } });
    expect(screen.getByRole('link', { name: 'Contacts Page' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Some records could not be searched'));
  });
});
