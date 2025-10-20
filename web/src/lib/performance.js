// Performance monitoring utilities
export class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.observers = [];
  }

  // Measure component render time
  measureRender(componentName, renderFn) {
    const start = performance.now();
    const result = renderFn();
    const end = performance.now();
    
    this.metrics[`render_${componentName}`] = end - start;
    return result;
  }

  // Measure API call performance
  measureApiCall(apiName, apiCall) {
    const start = performance.now();
    return apiCall().then(
      (result) => {
        const end = performance.now();
        this.metrics[`api_${apiName}`] = end - start;
        return result;
      },
      (error) => {
        const end = performance.now();
        this.metrics[`api_${apiName}_error`] = end - start;
        throw error;
      }
    );
  }

  // Get performance metrics
  getMetrics() {
    return { ...this.metrics };
  }

  // Clear metrics
  clearMetrics() {
    this.metrics = {};
  }

  // Monitor Core Web Vitals
  observeWebVitals() {
    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.lcp = lastEntry.startTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          this.metrics.fid = entry.processingStart - entry.startTime;
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.metrics.cls = clsValue;
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    }
  }

  // Cleanup observers
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  perfMonitor.observeWebVitals();
  
  // Log performance metrics on page unload
  window.addEventListener('beforeunload', () => {
    console.log('Performance Metrics:', perfMonitor.getMetrics());
  });
}