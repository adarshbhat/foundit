import { describe, it, expect, vi, beforeEach } from 'vitest';
import { on, emit, _resetListeners } from '../src/store';

beforeEach(() => {
  _resetListeners();
});

describe('store event bus', () => {
  it('calls listener when event is emitted', () => {
    const fn = vi.fn();
    on('items-changed', fn);
    emit('items-changed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call listener for a different event', () => {
    const fn = vi.fn();
    on('items-changed', fn);
    emit('bins-changed');
    expect(fn).not.toHaveBeenCalled();
  });

  it('supports multiple listeners on the same event', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    on('bins-changed', fn1);
    on('bins-changed', fn2);
    emit('bins-changed');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function', () => {
    const fn = vi.fn();
    const unsub = on('items-changed', fn);
    unsub();
    emit('items-changed');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no listeners', () => {
    expect(() => emit('items-changed')).not.toThrow();
  });
});
