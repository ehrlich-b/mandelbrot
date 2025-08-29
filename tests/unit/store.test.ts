import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleStore } from '../../apps/web/src/state/store';

describe('SimpleStore', () => {
  let store: SimpleStore;

  beforeEach(() => {
    store = new SimpleStore();
  });

  it('should have default viewport state', () => {
    const viewport = store.getViewport();
    
    expect(viewport.centerX).toBe(-0.5);
    expect(viewport.centerY).toBe(0);
    expect(viewport.scale).toBe(2.5);
    expect(viewport.maxIterations).toBe(256);
    expect(viewport.colorScheme).toBe(0);
  });

  it('should update viewport state', () => {
    store.setViewport({ centerX: -0.7, centerY: 0.1 });
    
    const viewport = store.getViewport();
    expect(viewport.centerX).toBe(-0.7);
    expect(viewport.centerY).toBe(0.1);
    expect(viewport.scale).toBe(2.5); // unchanged
  });

  it('should notify listeners on viewport change', () => {
    let notified = false;
    let receivedViewport = null;

    const unsubscribe = store.subscribe((viewport) => {
      notified = true;
      receivedViewport = viewport;
    });

    store.setViewport({ scale: 1.0 });

    expect(notified).toBe(true);
    expect(receivedViewport).toMatchObject({ scale: 1.0 });

    unsubscribe();
  });

  it('should manage bookmarks', () => {
    const bookmarks = store.getBookmarks();
    const initialCount = bookmarks.length;

    store.addBookmark('Test Location');
    
    const newBookmarks = store.getBookmarks();
    expect(newBookmarks).toHaveLength(initialCount + 1);
    expect(newBookmarks[initialCount].name).toBe('Test Location');
  });

  it('should load bookmarks', () => {
    store.loadBookmark(0); // Load first bookmark
    
    const viewport = store.getViewport();
    const bookmark = store.getBookmarks()[0];
    
    expect(viewport.centerX).toBe(bookmark.centerX);
    expect(viewport.centerY).toBe(bookmark.centerY);
    expect(viewport.scale).toBe(bookmark.scale);
  });
});