import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, StatusPill, formatMinutes } from './UI.jsx';

describe('operational UI states', () => {
  it('renders normalized statuses and values', () => {
    render(
      <>
        <StatusPill value="ANALYZING" />
        <span>{formatMinutes(45)}</span>
      </>,
    );
    expect(screen.getByText('ANALYZING')).toHaveClass('warn');
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('provides explicit empty and retry states', () => {
    const retry = vi.fn();
    const { rerender } = render(<EmptyState title="No disruptions" />);
    expect(screen.getByText('No disruptions')).toBeInTheDocument();
    rerender(<ErrorState error={new Error('Database unavailable')} onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('Database unavailable')).toBeInTheDocument();
    expect(retry).toHaveBeenCalledOnce();
  });
});
