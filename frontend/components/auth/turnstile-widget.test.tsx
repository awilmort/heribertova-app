// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from './turnstile-widget';

function stubTurnstile() {
  const options: { current?: Parameters<NonNullable<Window['turnstile']>['render']>[1] } = {};
  const render = vi.fn((_container: HTMLElement, opts: NonNullable<typeof options.current>) => {
    options.current = opts;
    return 'widget-1';
  });
  const remove = vi.fn();
  vi.stubGlobal('turnstile', { render, remove });
  return { render, remove, options };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TurnstileWidget', () => {
  it('renders the widget as soon as window.turnstile is available and reports its token', () => {
    const { render: renderMock, options } = stubTurnstile();
    const onToken = vi.fn();

    render(<TurnstileWidget nonce="abc" onToken={onToken} />);

    expect(renderMock).toHaveBeenCalledTimes(1);
    options.current?.callback('the-token');
    expect(onToken).toHaveBeenCalledWith('the-token');
  });

  it('reports null when the challenge expires or errors', () => {
    const { options } = stubTurnstile();
    const onToken = vi.fn();

    render(<TurnstileWidget nonce="abc" onToken={onToken} />);
    options.current?.['expired-callback']();
    expect(onToken).toHaveBeenLastCalledWith(null);

    options.current?.['error-callback']();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('waits for the script to define window.turnstile before rendering', () => {
    vi.useFakeTimers();
    const onToken = vi.fn();

    render(<TurnstileWidget nonce="abc" onToken={onToken} />);
    const { render: renderMock } = stubTurnstile();
    expect(renderMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('removes the widget on unmount', () => {
    const { remove } = stubTurnstile();
    const { unmount } = render(<TurnstileWidget nonce="abc" onToken={vi.fn()} />);

    unmount();
    expect(remove).toHaveBeenCalledWith('widget-1');
  });
});
