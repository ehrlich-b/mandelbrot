// Simple state management without external dependencies
export interface ViewportState {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: number;
  colorOffset: number;
  colorScale: number;
}

export interface BookmarkData {
  name: string;
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
  colorScheme: number;
}

export const defaultBookmarks: BookmarkData[] = [
  {
    name: 'Home',
    centerX: -0.5,
    centerY: 0,
    scale: 2.5,
    maxIterations: 256,
    colorScheme: 0,
  },
  {
    name: 'Seahorse Valley', 
    centerX: -0.75,
    centerY: 0.1,
    scale: 0.05,
    maxIterations: 512,
    colorScheme: 2,
  },
  {
    name: 'Spiral Detail',
    centerX: -0.7533,
    centerY: 0.1138, 
    scale: 0.001,
    maxIterations: 1024,
    colorScheme: 1,
  },
  {
    name: 'Lightning',
    centerX: -1.775,
    centerY: 0,
    scale: 0.01,
    maxIterations: 512,
    colorScheme: 3,
  }
];

export class SimpleStore {
  private viewport: ViewportState = {
    centerX: -0.5,
    centerY: 0,
    scale: 2.5,
    maxIterations: 256,
    width: window.innerWidth,
    height: window.innerHeight,
    colorScheme: 0,
    colorOffset: 0,
    colorScale: 1,
  };

  private bookmarks: BookmarkData[] = [...defaultBookmarks];
  private listeners: Array<(viewport: ViewportState) => void> = [];

  getViewport(): ViewportState {
    return { ...this.viewport };
  }

  setViewport(updates: Partial<ViewportState>): void {
    Object.assign(this.viewport, updates);
    this.notifyListeners();
  }

  getBookmarks(): BookmarkData[] {
    return [...this.bookmarks];
  }

  addBookmark(name: string): void {
    this.bookmarks.push({
      name,
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: this.viewport.maxIterations,
      colorScheme: this.viewport.colorScheme,
    });
  }

  loadBookmark(index: number): void {
    const bookmark = this.bookmarks[index];
    if (bookmark) {
      this.setViewport({
        centerX: bookmark.centerX,
        centerY: bookmark.centerY,
        scale: bookmark.scale,
        maxIterations: bookmark.maxIterations,
        colorScheme: bookmark.colorScheme,
      });
    }
  }

  subscribe(listener: (viewport: ViewportState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.viewport));
  }

  // Save state to localStorage
  saveState(): void {
    try {
      localStorage.setItem('mandelbrot-viewport', JSON.stringify(this.viewport));
      localStorage.setItem('mandelbrot-bookmarks', JSON.stringify(this.bookmarks));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }

  // Load state from localStorage
  loadState(): void {
    try {
      const savedViewport = localStorage.getItem('mandelbrot-viewport');
      if (savedViewport) {
        const parsed = JSON.parse(savedViewport);
        Object.assign(this.viewport, parsed);
      }

      const savedBookmarks = localStorage.getItem('mandelbrot-bookmarks');
      if (savedBookmarks) {
        this.bookmarks = JSON.parse(savedBookmarks);
      }
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error);
    }
  }
}

// Global store instance
export const store = new SimpleStore();